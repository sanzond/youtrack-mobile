/* @flow */


import {confirmation} from '../../components/confirmation/confirmation';

export const confirmDeleteArticle = (message?: string) => (
  confirmation('Are you sure you want to delete this article?', 'Delete', message)
);

export const confirmDeleteArticleDraft = (message?: string) => (
  confirmation('Are you sure you want to delete this draft?', 'Delete', message)
);

export const confirmDeleteAllDrafts = () => (
  confirmation(
    'Are you sure you want to delete all article drafts?',
    'Delete',
    'This action deletes all drafts, including unpublished sub-articles'
  )
);
