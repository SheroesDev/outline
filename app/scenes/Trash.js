// @flow
import * as React from 'react';
import { observer, inject } from 'mobx-react';
import { NewDocumentIcon } from 'outline-icons';

import Heading from 'components/Heading';
import CenteredContent from 'components/CenteredContent';
import { ListPlaceholder } from 'components/LoadingPlaceholder';
import Empty from 'components/Empty';
import PageTitle from 'components/PageTitle';
import DocumentList from 'components/DocumentList';
import NewDocumentMenu from 'menus/NewDocumentMenu';
import Actions, { Action } from 'components/Actions';
import DocumentsStore from 'stores/DocumentsStore';

type Props = {
  documents: DocumentsStore,
};

@observer
class Trash extends React.Component<Props> {
  componentDidMount() {
    this.props.documents.fetchDeleted();
  }

  render() {
    const { isLoaded, isFetching, deleted } = this.props.documents;
    const showLoading = !isLoaded && isFetching;
    const showEmpty = isLoaded && !deleted.length;

    return (
      <CenteredContent column auto>
        <PageTitle title="Trash" />
        <Heading>Trash</Heading>
        {showLoading && <ListPlaceholder />}
        {showEmpty && <Empty>You’ve not got any deleted documents at the moment.</Empty>}
        <DocumentList documents={deleted} showCollection />
        <Actions align="center" justify="flex-end">
          <Action>
            <NewDocumentMenu label={<NewDocumentIcon />} />
          </Action>
        </Actions>
      </CenteredContent>
    );
  }
}

export default inject('documents')(Trash);
