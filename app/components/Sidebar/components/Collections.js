// @flow
import * as React from 'react';
import { observer, inject } from 'mobx-react';
import type { Location } from 'react-router-dom';
import Flex from 'shared/components/Flex';
import { PlusIcon } from 'outline-icons';

import Header from './Header';
import SidebarLink from './SidebarLink';
import CollectionLink from './CollectionLink';

import CollectionsStore from 'stores/CollectionsStore';
import UiStore from 'stores/UiStore';
import DocumentsStore from 'stores/DocumentsStore';

type Props = {
  history: Object,
  location: Location,
  collections: CollectionsStore,
  documents: DocumentsStore,
  onCreateCollection: () => void,
  ui: UiStore,
};

@observer
class Collections extends React.Component<Props> {
  componentDidMount() {
    this.props.collections.fetchPage({ limit: 100 });
  }

  render() {
    const { history, location, collections, ui, documents } = this.props;

    return (
      <Flex column>
        <Header>Collections</Header>
        {collections.orderedData.map(collection => (
          <CollectionLink
            key={collection.id}
            history={history}
            location={location}
            collection={collection}
            activeDocument={documents.active}
            prefetchDocument={documents.prefetchDocument}
            ui={ui}
          />
        ))}

        {collections.isLoaded && (
          <SidebarLink
            onClick={this.props.onCreateCollection}
            icon={<PlusIcon />}
          >
            New collection…
          </SidebarLink>
        )}
      </Flex>
    );
  }
}

export default inject('collections', 'ui', 'documents')(Collections);
