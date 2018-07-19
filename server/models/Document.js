// @flow
import slug from 'slug';
import _ from 'lodash';
import randomstring from 'randomstring';
import MarkdownSerializer from 'slate-md-serializer';
import Plain from 'slate-plain-serializer';
import Sequelize from 'sequelize';

import isUUID from 'validator/lib/isUUID';
import { Collection } from '../models';
import { DataTypes, sequelize } from '../sequelize';
import events from '../events';
import parseTitle from '../../shared/utils/parseTitle';
import Revision from './Revision';

const Op = Sequelize.Op;
const Markdown = new MarkdownSerializer();
const URL_REGEX = /^[a-zA-Z0-9-]*-([a-zA-Z0-9]{10,15})$/;
const DEFAULT_TITLE = 'Untitled document';

// $FlowIssue invalid flow-typed
slug.defaults.mode = 'rfc3986';
const slugify = text =>
  slug(text, {
    remove: /[.]/g,
  });

const createRevision = (doc, options = {}) => {
  if (options.autosave) return;

  return Revision.create({
    title: doc.title,
    text: doc.text,
    userId: doc.lastModifiedById,
    documentId: doc.id,
  });
};

const createUrlId = doc => {
  return (doc.urlId = doc.urlId || randomstring.generate(10));
};

const beforeSave = async doc => {
  const { emoji, title } = parseTitle(doc.text);

  // emoji in the title is split out for easier display
  doc.emoji = emoji;

  // ensure document has a title
  if (!title) {
    doc.title = DEFAULT_TITLE;
    doc.text = doc.text.replace(/^.*$/m, `# ${DEFAULT_TITLE}`);
  }

  // calculate collaborators
  let ids = [];
  if (doc.id) {
    ids = await Revision.findAll({
      attributes: [[DataTypes.literal('DISTINCT "userId"'), 'userId']],
      where: {
        documentId: doc.id,
      },
    }).map(rev => rev.userId);
  }

  // add the current user as revision hasn't been generated yet
  ids.push(doc.lastModifiedById);
  doc.collaboratorIds = _.uniq(ids);

  // increment revision
  doc.revisionCount += 1;

  return doc;
};

const Document = sequelize.define(
  'document',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    urlId: { type: DataTypes.STRING, primaryKey: true },
    private: { type: DataTypes.BOOLEAN, defaultValue: true },
    title: DataTypes.STRING,
    text: DataTypes.TEXT,
    revisionCount: { type: DataTypes.INTEGER, defaultValue: 0 },
    publishedAt: DataTypes.DATE,
    parentDocumentId: DataTypes.UUID,
    collaboratorIds: DataTypes.ARRAY(DataTypes.UUID),
  },
  {
    paranoid: true,
    hooks: {
      beforeValidate: createUrlId,
      beforeCreate: beforeSave,
      beforeUpdate: beforeSave,
      afterCreate: createRevision,
      afterUpdate: createRevision,
    },
  }
);

// Class methods

Document.associate = models => {
  Document.belongsTo(models.Collection, {
    as: 'collection',
    foreignKey: 'atlasId',
    onDelete: 'cascade',
  });
  Document.belongsTo(models.Team, {
    as: 'team',
    foreignKey: 'teamId',
  });
  Document.belongsTo(models.User, {
    as: 'createdBy',
    foreignKey: 'createdById',
  });
  Document.belongsTo(models.User, {
    as: 'updatedBy',
    foreignKey: 'lastModifiedById',
  });
  Document.belongsTo(models.User, {
    as: 'pinnedBy',
    foreignKey: 'pinnedById',
  });
  Document.hasMany(models.Revision, {
    as: 'revisions',
    onDelete: 'cascade',
  });
  Document.hasMany(models.Star, {
    as: 'starred',
  });
  Document.hasMany(models.View, {
    as: 'views',
  });
  Document.addScope(
    'defaultScope',
    {
      include: [
        { model: models.Collection, as: 'collection' },
        { model: models.User, as: 'createdBy', paranoid: false },
        { model: models.User, as: 'updatedBy', paranoid: false },
      ],
      where: {
        publishedAt: {
          // $FlowFixMe
          [Op.ne]: null,
        },
      },
    },
    { override: true }
  );
  Document.addScope('withUnpublished', {
    include: [
      { model: models.Collection, as: 'collection' },
      { model: models.User, as: 'createdBy', paranoid: false },
      { model: models.User, as: 'updatedBy', paranoid: false },
    ],
  });
  Document.addScope('withViews', userId => ({
    include: [
      { model: models.View, as: 'views', where: { userId }, required: false },
    ],
  }));
  Document.addScope('withStarred', userId => ({
    include: [
      { model: models.Star, as: 'starred', where: { userId }, required: false },
    ],
  }));
};

Document.findById = async id => {
  const scope = Document.scope('withUnpublished');

  if (isUUID(id)) {
    return scope.findOne({
      where: { id },
    });
  } else if (id.match(URL_REGEX)) {
    return scope.findOne({
      where: {
        urlId: id.match(URL_REGEX)[1],
      },
    });
  }
};

Document.searchForUser = async (
  user,
  query,
  options = {}
): Promise<Document[]> => {
  const limit = options.limit || 15;
  const offset = options.offset || 0;

  const sql = `
        SELECT *, ts_rank(documents."searchVector", plainto_tsquery('english', :query)) as "searchRanking" FROM documents
        WHERE "searchVector" @@ plainto_tsquery('english', :query) AND
          "teamId" = '${user.teamId}'::uuid AND
          "deletedAt" IS NULL
        ORDER BY "searchRanking" DESC
        LIMIT :limit OFFSET :offset;
        `;

  const results = await sequelize.query(sql, {
    replacements: {
      query,
      limit,
      offset,
    },
    model: Document,
  });
  const ids = results.map(document => document.id);

  // Second query to get views for the data
  const withViewsScope = { method: ['withViews', user.id] };
  const documents = await Document.scope(
    'defaultScope',
    withViewsScope
  ).findAll({
    where: { id: ids },
  });

  // Order the documents in the same order as the first query
  return _.sortBy(documents, doc => ids.indexOf(doc.id));
};

// Hooks

Document.addHook('beforeSave', async model => {
  if (!model.publishedAt) return;

  const collection = await Collection.findById(model.atlasId);
  if (collection.type !== 'atlas') return;

  await collection.updateDocument(model);
  model.collection = collection;
});

Document.addHook('afterCreate', async model => {
  if (!model.publishedAt) return;

  const collection = await Collection.findById(model.atlasId);
  if (collection.type !== 'atlas') return;

  await collection.addDocumentToStructure(model);
  model.collection = collection;

  events.add({ name: 'documents.create', model });
  return model;
});

Document.addHook('afterDestroy', model =>
  events.add({ name: 'documents.delete', model })
);

// Instance methods

Document.prototype.publish = async function() {
  if (this.publishedAt) return this.save();

  const collection = await Collection.findById(this.atlasId);
  if (collection.type !== 'atlas') return this.save();

  await collection.addDocumentToStructure(this);

  this.publishedAt = new Date();
  await this.save();
  this.collection = collection;

  events.add({ name: 'documents.publish', model: this });
  return this;
};

Document.prototype.getTimestamp = function() {
  return Math.round(new Date(this.updatedAt).getTime() / 1000);
};

Document.prototype.getSummary = function() {
  const value = Markdown.deserialize(this.text);
  const plain = Plain.serialize(value);
  const lines = _.compact(plain.split('\n'));
  return lines.length >= 1 ? lines[1] : '';
};

Document.prototype.getUrl = function() {
  const slugifiedTitle = slugify(this.title);
  return `/doc/${slugifiedTitle}-${this.urlId}`;
};

Document.prototype.toJSON = function() {
  // Warning: only use for new documents as order of children is
  // handled in the collection's documentStructure
  return {
    id: this.id,
    title: this.title,
    url: this.getUrl(),
    children: [],
  };
};

export default Document;
