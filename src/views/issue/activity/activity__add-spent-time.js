/* @flow */

import React, {memo, useContext, useEffect, useState} from 'react';
import {ActivityIndicator, Text, TextInput, TouchableOpacity, View} from 'react-native';

import throttle from 'lodash.throttle';
import InputScrollView from 'react-native-input-scroll-view';

import * as issueActivityItems from './issue-activity__actions';
import DatePicker from '../../../components/date-picker/date-picker';
import Header from '../../../components/header/header';
import Router from '../../../components/router/router';
import Select from '../../../components/select/select';
import {ANALYTICS_ISSUE_STREAM_SECTION} from '../../../components/analytics/analytics-ids';
import {commentPlaceholderText} from '../../../app-text';
import {confirmation} from '../../../components/confirmation/confirmation';
import {getEntityPresentation, ytDate} from '../../../components/issue-formatter/issue-formatter';
import {hasType} from '../../../components/api/api__resource-types';
import {HIT_SLOP} from '../../../components/common-styles/button';
import {IconAngleRight, IconCheck, IconClose} from '../../../components/icon/icon';
import {logEvent} from '../../../components/log/log-helper';
import {ThemeContext} from '../../../components/theme/theme-context';
import {useDispatch, useSelector} from 'react-redux';

import styles from './activity__add-spent-time.styles';

import type {AppState} from '../../../reducers';
import type {SelectProps} from '../../../components/select/select';
import type {Theme} from '../../../flow/Theme';
import type {User} from '../../../flow/User';
import type {ViewStyleProp} from 'react-native/Libraries/StyleSheet/StyleSheet';
import type {WorkItem, TimeTracking, WorkItemType} from '../../../flow/Work';

type Props = {
  workItem?: WorkItem,
  onAdd?: () => any,
  canCreateNotOwn?: boolean
}

const AddSpentTimeForm = (props: Props) => {
  const theme: Theme = useContext(ThemeContext);
  const dispatch = useDispatch();
  const currentUser: User = useSelector((state: AppState) => state.app.user);

  const draftDefault: WorkItem = {
    date: new Date().getTime(),
    author: currentUser,
    duration: {
      presentation: '1d'
    },
    type: {
      id: null,
      key: 'no-work-type',
      name: 'No type'
    },
    text: null
  };

  const [isProgress, updateProgress] = useState(false);
  const [isSelectVisible, updateSelectVisibility] = useState(false);
  const [draft, updateDraftWorkItem] = useState(props.workItem || draftDefault);
  const [selectProps, updateSelectProps] = useState(null);
  const [error, updateError] = useState(false);

  const getDraft = (draftItem: WorkItem) => ({
    ...draftItem,
    type: !draftItem.type || draftItem.type?.id === null ? null : draftItem.type
  });

  const updateDraft = async (draftItem: WorkItem) => {
    const draftWithType: WorkItem = getDraft(draftItem);
    const updatedDraft: WorkItem = await dispatch(
      issueActivityItems.updateWorkItemDraft(draftWithType)
    );
    if (updatedDraft) {
      updateDraftWorkItem({
        ...draftItem,
        $type: updatedDraft.$type,
        id: updatedDraft.id
      });
    }
  };

  const debouncedUpdate = throttle(updateDraft, 350);

  useEffect(() => {
    if (props.workItem) {
      updateDraftWorkItem(props.workItem);
      issueActivityItems.updateWorkItem();
    } else {
      loadTimeTracking();
    }

    async function loadTimeTracking() {
      updateProgress(true);
      const timeTracking: TimeTracking = await dispatch(issueActivityItems.getTimeTracking());
      updateDraftWorkItem({
        ...draftDefault,
        ...timeTracking?.workItemTemplate,
        ...timeTracking?.draftWorkItem,
        usesMarkdown: true,
        $type: undefined
      });
      updateProgress(false);
    }
  }, []);


  const update = (data: $Shape<TimeTracking>) => {
    updateError(false);
    const updatedDraft: WorkItem = {
      ...draft,
      ...data
    };
    updateDraftWorkItem(updatedDraft);
    if (!props.workItem) {
      debouncedUpdate(updatedDraft);
    }
  };

  const renderSelect = (selectProps: SelectProps) => {
    const defaultSelectProps: SelectProps = {
      placeholder: 'Filter items',
      multi: false,
      dataSource: () => Promise.resolve([]),
      selectedItems: [],
      getTitle: (it: Object) => getEntityPresentation(it),
      onCancel: () => updateSelectVisibility(false),
      onChangeSelection: () => null,
      onSelect: () => updateSelectVisibility(false)
    };
    return <Select {...Object.assign({}, defaultSelectProps, selectProps)}/>;
  };

  const getUserSelectProps = (): $Shape<SelectProps> => {
    return {
      dataSource: async () => await dispatch(issueActivityItems.getWorkItemAuthors()),
      onSelect: (author: User) => {
        logEvent({
          message: 'SpentTime: form:set-author',
          analyticsId: ANALYTICS_ISSUE_STREAM_SECTION
        });
        update({author});
        updateSelectVisibility(false);
      }
    };
  };

  const getWorkTypeSelectProps = (): $Shape<SelectProps> => {
    return {
      dataSource: async () => {
        const types: Array<WorkItemType> = await dispatch(issueActivityItems.getWorkItemTypes());
        return [draftDefault.type].concat(types);
      },
      onSelect: async (type: WorkItemType) => {
        logEvent({
          message: 'SpentTime: form:set-work-type',
          analyticsId: ANALYTICS_ISSUE_STREAM_SECTION
        });
        update({type});
        updateSelectVisibility(false);
      }
    };
  };

  const close = () => Router.pop(true);

  const onClose = () => {
    dispatch(issueActivityItems.deleteWorkItemDraft());
    close();
  };

  const onCreate = async () => {
    const {onAdd = () => {}} = props;
    logEvent({
      message: 'SpentTime: form:submit',
      analyticsId: ANALYTICS_ISSUE_STREAM_SECTION
    });
    updateProgress(true);
    const updatedDraft: WorkItem = getDraft(draft);
    const item: ?WorkItem = await dispatch(issueActivityItems.createWorkItem({
      ...updatedDraft,
      $type: props.workItem ? updatedDraft.$type : undefined
    }));
    updateProgress(false);
    const isWorkItem = hasType.work(item);
    if (isWorkItem) {
      onAdd();
      close();
    } else {
      updateError(true);
    }
  };

  const renderHeader = () => {
    const isSubmitDisabled: boolean = (
      !draft.date ||
      !draft.duration ||
      !draft.author ||
      !draft?.duration?.presentation
    );
    const submitIcon = (isProgress
      ? <ActivityIndicator color={styles.link.color}/>
      : <IconCheck size={20} color={isSubmitDisabled ? styles.disabled.color : styles.link.color}/>);

    return (
      <Header
        style={styles.elevation1}
        title="Spent time"
        leftButton={<IconClose size={21} color={isProgress ? styles.disabled.color : styles.link.color}/>}
        onBack={() => {
          if (!isProgress) {
            confirmation('Discard draft and close?', 'Discard and close')
              .then(() => {
                logEvent({
                  message: 'SpentTime: form:cancel',
                  analyticsId: ANALYTICS_ISSUE_STREAM_SECTION
                });
                onClose();
              }).catch(() => null);
          }
        }}
        extraButton={(
          <TouchableOpacity
            hitSlop={HIT_SLOP}
            disabled={isSubmitDisabled}
            onPress={onCreate}
          >
            {submitIcon}
          </TouchableOpacity>
        )}
      />
    );
  };

  const buttonStyle: Array<ViewStyleProp> = [styles.feedbackFormInput, styles.feedbackFormType];
  const iconAngleRight = <IconAngleRight size={20} color={styles.icon.color}/>;
  const author: ?User = draft.author || currentUser;

  const commonInputProps: Object = {
    autoCapitalize: 'none',
    selectTextOnFocus: true,
    autoCorrect: false,
    placeholderTextColor: styles.icon.color,
    keyboardAppearance: theme.uiTheme.name
  };
  return (
    <View style={styles.container}>
      {renderHeader()}

      <InputScrollView
        topOffset={styles.feedbackFormBottomIndent.height}
        multilineInputStyle={styles.feedbackFormText}
        style={styles.feedbackContainer}
      >
        <View style={styles.feedbackForm}>
          <TouchableOpacity
            style={buttonStyle}
            disabled={!props.canCreateNotOwn}
            onPress={() => {
              updateSelectProps(getUserSelectProps());
              updateSelectVisibility(true);
            }}
          >
            <Text style={styles.feedbackFormTextSup}>Author</Text>
            <Text
              style={[styles.feedbackFormText, styles.feedbackFormTextMain]}
            >
              {getEntityPresentation(author)}
            </Text>
            {props.canCreateNotOwn && iconAngleRight}
          </TouchableOpacity>

          <TouchableOpacity
            style={buttonStyle}
            onPress={
              () => Router.PageModal({
                children: <DatePicker current={draft.date} onDateSelect={(date: Date) => {
                  update({date: date.getTime()});
                  close();
                }}
                />
              })
            }
          >
            <Text style={styles.feedbackFormTextSup}>Date</Text>
            <Text
              style={[styles.feedbackFormText, styles.feedbackFormTextMain]}
            >
              {ytDate(draft.date, true)}
            </Text>
            {iconAngleRight}
          </TouchableOpacity>

          <View style={buttonStyle}>
            <Text style={[
              styles.feedbackFormTextSup,
              error && styles.feedbackFormTextError
            ]}>Spent time</Text>
            <TextInput
              {...commonInputProps}
              style={[styles.feedbackInput, styles.feedbackFormTextMain]}
              placeholder="1w 1d 1h 1m"
              value={draft?.duration?.presentation}
              onChangeText={(periodValue: string) => update({duration: {presentation: periodValue}})}
            />
          </View>
          {error && <Text style={styles.feedbackInputErrorHint}>1w 1d 1h 1m</Text>}

          <TouchableOpacity
            style={buttonStyle}
            onPress={() => {
              updateSelectProps(getWorkTypeSelectProps());
              updateSelectVisibility(true);
            }}
          >
            <Text style={styles.feedbackFormTextSup}>Type</Text>
            <Text
              style={[styles.feedbackFormText, styles.feedbackFormTextMain]}
              numberOfLines={1}
            >{draft?.type?.name || draftDefault.type.name}</Text>
            {iconAngleRight}
          </TouchableOpacity>

          <TextInput
            {...commonInputProps}
            multiline
            textAlignVertical="top"
            style={[styles.feedbackFormInputDescription]}
            placeholder={commentPlaceholderText}
            value={draft?.text}
            onChangeText={(comment: string) => update({text: comment})}
          />

          <View style={styles.feedbackFormBottomIndent}/>
        </View>
      </InputScrollView>
      {isSelectVisible && !!selectProps && renderSelect(selectProps)}
    </View>
  );
};

export default memo<Props>(AddSpentTimeForm);
