/* @flow */

import Api from '../api/api';
import CustomField from '../custom-field/custom-field';
import Header from '../header/header';
import ModalView from '../modal-view/modal-view';
import React, {Component} from 'react';
import Select from '../select/select';
import {Calendar} from 'react-native-calendars'; // eslint-disable-line import/named
import {createNullProjectCustomField} from '../../util/util';
import {getApi} from '../api/api__instance';
import {IconClose} from '../icon/icon';
import {PanelWithSeparator} from '../panel/panel-with-separator';
import {SkeletonIssueCustomFields} from '../skeleton/skeleton';
import {View as AnimatedView} from 'react-native-animatable';
import {View, ScrollView, Text, TouchableOpacity, TextInput, ActivityIndicator} from 'react-native';

import styles, {calendarTheme} from './custom-fields-panel.styles';

import type {IssueProject, CustomField as CustomFieldType} from '../../flow/CustomFields';
import type {ViewStyleProp} from 'react-native/Libraries/StyleSheet/StyleSheet';
import type {UITheme} from '../../flow/Theme';

type Props = {
  autoFocusSelect?: boolean,
  style?: ViewStyleProp,

  issueId: string,
  issueProject: IssueProject,
  fields: Array<CustomFieldType>,

  hasPermission: {
    canUpdateField: (field: CustomFieldType) => boolean,
    canCreateIssueToProject: (project: IssueProject) => boolean,
    canEditProject: boolean
  },

  onUpdate: (field: CustomFieldType, value: null | number | Object | Array<Object>) => Promise<Object>,
  onUpdateProject: (project: IssueProject) => Promise<Object>,

  uiTheme: UITheme
};

type State = {
  editingField: ?CustomFieldType,
  savingField: ?CustomFieldType,
  isEditingProject: boolean,
  isSavingProject: boolean,

  select: {
    show: boolean,
    dataSource: (query: string) => Promise<Array<Object>>,
    onSelect: (item: any) => any,
    onChangeSelection?: (selectedItems: Array<Object>) => any,
    multi: boolean,
    emptyValue?: ?string,
    selectedItems: Array<Object>,
    placeholder?: string,
    getValue?: (item: Object) => string,
    getTitle?: (item: Object) => string
  },

  datePicker: {
    show: boolean,
    title: string,
    withTime: boolean,
    time: ?string,
    value: Date,
    emptyValueName?: ?string,
    onSelect: (selected: any) => any
  },

  simpleValue: {
    show: boolean,
    value: string,
    placeholder: string,
    onApply: any => any
  }
}

const initialEditorsState = {
  select: {
    show: false,
    dataSource: () => Promise.resolve([]),
    onChangeSelection: items => {},
    onSelect: () => {},
    multi: false,
    selectedItems: []
  },

  datePicker: {
    show: false,
    title: '',
    time: null,
    withTime: false,
    value: new Date(),
    onSelect: () => {
    }
  },

  simpleValue: {
    show: false,
    value: '',
    placeholder: '',
    onApply: () => {}
  }
};

const DATE_AND_TIME = 'date and time';

export default class CustomFieldsPanel extends Component<Props, State> {
  api: Api = getApi();
  currentScrollX: number = 0;
  isComponentMounted: ?boolean;

  constructor() {
    super();

    this.state = {
      topCoord: 0,
      height: 0,
      editingField: null,
      savingField: null,
      isEditingProject: false,
      isSavingProject: false,
      ...initialEditorsState
    };
  }

  componentDidMount(): void {
    this.isComponentMounted = true;
  }

  componentWillUnmount(): void {
    this.isComponentMounted = null;
  }

  shouldComponentUpdate(nextProps: Props, prevState: State): boolean {
    return (
      this.props.uiTheme !== nextProps.uiTheme ||
      this.props.fields !== nextProps.fields ||
      this.state !== prevState
    );
  }

  saveUpdatedField(field: CustomFieldType, value: null | number | Object | Array<Object>) {
    const updateSavingState = (value) => this.isComponentMounted && this.setState({savingField: value});
    this.closeEditor();
    updateSavingState(field);

    return this.props.onUpdate(field, value)
      .then(res => {
        updateSavingState(null);
        return res;
      })
      .catch(() => updateSavingState(null));
  }

  onSelectProject = () => {
    if (this.state.isEditingProject) {
      return this.closeEditor();
    }

    const {hasPermission} = this.props;

    this.closeEditor();
    this.setState({
      isEditingProject: true,
      select: {
        show: true,
        getValue: project => project.name + project.shortName,
        dataSource: async query => {
          const projects = await this.api.getProjects(query);

          return projects
            .filter(project => !project.archived)
            .filter(project => hasPermission.canCreateIssueToProject(project));
        },
        multi: false,
        placeholder: 'Search for the project',
        selectedItems: [this.props.issueProject],
        onSelect: (project: IssueProject) => {
          this.closeEditor();
          this.setState({isSavingProject: true});
          return this.props.onUpdateProject(project).then(() => this.setState({isSavingProject: false}));
        }
      }
    });
  };

  closeEditor(): Promise<any> {
    return new Promise(resolve => {
      this.setState({
        editingField: null,
        isEditingProject: false,
        ...initialEditorsState
      }, resolve);
    });
  }

  editDateField(field: CustomFieldType) {
    const withTime = field.projectCustomField.field.fieldType.valueType === DATE_AND_TIME;
    return this.setState({
      datePicker: {
        show: true,
        withTime,
        time: field.value ? new Date(field.value).toLocaleTimeString(
          [],
          {
            hour: '2-digit',
            minute: '2-digit'
          }
        ) : null,
        title: field.projectCustomField.field.name,
        value: field.value ? new Date(field.value) : new Date(),
        emptyValueName: field.projectCustomField.canBeEmpty ? field.projectCustomField.emptyFieldText : null,
        onSelect: (date) => {
          if (!date) {
            return this.saveUpdatedField(field, null);
          }
          if (withTime && this.state.datePicker.time) {
            try {
              const match = this.state.datePicker.time.match(/(\d\d):(\d\d)/);
              if (match) {
                const [, hours = 3, minutes = 0] = match;
                date.setHours(hours, minutes);
              }
            } catch (e) {
              throw new Error(`Invalid date: ${e}`);
            }
          }

          this.saveUpdatedField(field, date.getTime());
        }
      }
    });
  }

  editSimpleValueField(field: CustomFieldType, type: string) {
    const placeholders = {
      integer: '-12 or 34',
      string: 'Type value',
      text: 'Type text value',
      float: 'Type float value',
      default: '1w 1d 1h 1m'
    };

    const valueFormatters = {
      integer: value => parseInt(value),
      float: value => parseFloat(value),
      string: value => value,
      text: value => ({text: value}),
      default: value => ({presentation: value})
    };

    const placeholder = placeholders[type] || placeholders.default;
    const valueFormatter = valueFormatters[type] || valueFormatters.default;

    const value = field.value
      ? field.value.presentation || field.value.text || field.value.toString()
      : '';

    return this.setState({
      simpleValue: {
        show: true,
        placeholder,
        value,
        onApply: (value) => this.saveUpdatedField(field, valueFormatter(value))
      }
    });
  }

  editCustomField(field: CustomFieldType) {
    const projectCustomField = field.projectCustomField;
    const isMultiValue = projectCustomField.field.fieldType.isMultiValue;
    let selectedItems;

    if (isMultiValue) {
      selectedItems = field.value;
    } else {
      selectedItems = field.value ? [field.value] : [];
    }

    this.setState({
      select: {
        show: true,
        multi: isMultiValue,
        selectedItems: selectedItems,
        emptyValue: projectCustomField.canBeEmpty ? projectCustomField.emptyFieldText : null,
        placeholder: 'Search for the field value',
        dataSource: () => {
          if (field.hasStateMachine) {
            return this.api.getStateMachineEvents(this.props.issueId, field.id)
              .then(items => items.map(it => Object.assign(it, {name: `${it.id} (${it.presentation})`})));
          }
          return this.api.getCustomFieldValues(
            projectCustomField?.bundle?.id,
            projectCustomField.field.fieldType.valueType
          );
        },
        onChangeSelection: selectedItems => this.setState({
          select: {
            ...this.state.select,
            selectedItems
          }
        }),
        onSelect: (value) => this.saveUpdatedField(field, value)
      }
    });
  }

  onEditField = (field: CustomFieldType) => {
    if (field === this.state.editingField) {
      return this.closeEditor();
    }
    const {fieldType} = field.projectCustomField?.field;

    if (!fieldType) {
      return null;
    }

    this.setState({
      editingField: field,
      isEditingProject: false,
      ...initialEditorsState
    });

    if (fieldType.valueType === 'date' || fieldType.valueType === DATE_AND_TIME) {
      return this.editDateField(field);
    }

    if (['period', 'integer', 'string', 'text', 'float'].indexOf(fieldType.valueType) !== -1) {
      return this.editSimpleValueField(field, fieldType.valueType);
    }

    return this.editCustomField(field);
  };

  storeScrollPosition = (event: Object) => {
    const {nativeEvent} = event;
    this.currentScrollX = nativeEvent.contentOffset.x;
  };

  restoreScrollPosition = (scrollNode: ?ScrollView, ensure: boolean = true) => {
    if (!scrollNode || !this.currentScrollX) {
      return;
    }

    scrollNode.scrollTo({
      x: this.currentScrollX,
      y: 0,
      animated: false
    });

    // Android doesn't get first scrollTo call https://youtrack.jetbrains.com/issue/YTM-402
    // iOS doesn't scroll immediately since 0.48 https://github.com/facebook/react-native/issues/15808
    if (ensure) {
      setTimeout(() => this.restoreScrollPosition(scrollNode, false));
    }
  };

  _renderSelect() {
    return <Select
      {...this.state.select}
      autoFocus={this.props.autoFocusSelect}
      onCancel={() => this.closeEditor()}
    />;
  }

  renderHeader(title: string, uiTheme: UITheme) {
    return (
      <Header
        style={styles.customFieldEditorHeader}
        rightButton={<IconClose size={21} color={uiTheme.colors.$link}/>}
        onRightButtonClick={() => this.closeEditor()}
        title={title}
      />
    );
  }

  _renderDatePicker(uiTheme: UITheme) {
    const {datePicker} = this.state;

    return (
      <ModalView
        animationType="slide"
      >
        {this.renderHeader(datePicker.title, uiTheme)}

        <View style={styles.customFieldDateEditor}>

          <View style={styles.customFieldDateEditorValue}>
            {datePicker.emptyValueName &&
            <TouchableOpacity onPress={() => datePicker.onSelect(null)}>
              <Text style={styles.clearDate}>{datePicker.emptyValueName} (Clear value)</Text>
            </TouchableOpacity>}
          </View>

          {datePicker.withTime && (
            <TextInput
              placeholderTextColor={uiTheme.colors.$icon}
              style={styles.simpleValueInput}
              placeholder="13:00"
              underlineColorAndroid="transparent"
              clearButtonMode="always"
              autoCorrect={false}
              autoCapitalize="none"
              value={datePicker.time}
              onSubmitEditing={() => {
                datePicker.onSelect(datePicker.value);
                this.closeEditor();
              }}
              onChangeText={text => {
                this.setState({
                  datePicker: {
                    ...datePicker,
                    time: text
                  }
                });
              }}
            />
          )}

          <Calendar
            style={styles.customFieldDateEditorCalendar}
            current={datePicker.value}
            selected={[datePicker.value]}
            onDayPress={day => {
              return datePicker.onSelect(new Date(day.timestamp));
            }}
            firstDay={1}
            theme={calendarTheme(uiTheme)}
          />
        </View>
      </ModalView>
    );
  }

  _renderSimpleValueInput(uiTheme: UITheme) {
    const {simpleValue, editingField} = this.state;

    return (
      <ModalView
        animationType="slide"
      >
        {this.renderHeader(editingField?.projectCustomField?.field?.name || '', uiTheme)}

        <View style={styles.customFieldSimpleEditor}>
          <TextInput
            placeholderTextColor={uiTheme.colors.$icon}
            style={styles.simpleValueInput}
            placeholder={simpleValue.placeholder}
            underlineColorAndroid="transparent"
            clearButtonMode="always"
            returnKeyType="done"
            autoCorrect={false}
            autoFocus={true}
            autoCapitalize="none"
            onChangeText={(value) => {
              this.setState({
                simpleValue: {
                  ...this.state.simpleValue,
                  value
                }
              });
            }}
            onSubmitEditing={() => simpleValue.onApply(simpleValue.value)}
            value={simpleValue.value}/>
        </View>
      </ModalView>

    );
  }

  renderFields() {
    const {hasPermission, fields, issueProject = {name: ''}} = this.props;
    const {savingField, editingField, isEditingProject, isSavingProject} = this.state;

    return (
      <>
        {!fields && <View style={styles.customFieldsPanel}>
          <SkeletonIssueCustomFields/>
        </View>}

        {!!fields && <PanelWithSeparator>
          <ScrollView
            ref={this.restoreScrollPosition}
            onScroll={this.storeScrollPosition}
            contentOffset={{
              x: this.currentScrollX,
              y: 0
            }}
            scrollEventThrottle={100}
            horizontal={true}
            style={styles.customFieldsPanel}
            keyboardShouldPersistTaps="always"
          >
            <View key="Project">
              <CustomField
                disabled={!hasPermission.canEditProject}
                onPress={this.onSelectProject}
                active={isEditingProject}
                field={createNullProjectCustomField(issueProject.name)}
              />
              {isSavingProject && <ActivityIndicator style={styles.savingFieldIndicator}/>}
            </View>

            {fields.map((field: CustomFieldType) => {
              const isDisabled: boolean = (
                !hasPermission.canUpdateField(field) ||
                !field?.projectCustomField?.field?.fieldType
              );
              return <View key={field.id}>
                <CustomField
                  field={field}
                  onPress={() => this.onEditField(field)}
                  active={editingField === field}
                  disabled={isDisabled}/>

                {savingField && savingField.id === field.id && <ActivityIndicator style={styles.savingFieldIndicator}/>}
              </View>;
            })}
          </ScrollView>
        </PanelWithSeparator>}
      </>
    );
  }

  render() {
    const {uiTheme, style} = this.props;
    const {select, datePicker, simpleValue, editingField} = this.state;

    return (
      <View
        style={[styles.container, style]}
      >

        {this.renderFields()}

        <AnimatedView
          style={styles.editorViewContainer}
          animation="fadeIn"
          duration={500}
          useNativeDriver
        >
          {select.show && this._renderSelect()}
          {datePicker.show && this._renderDatePicker(uiTheme)}
          {(simpleValue.show && !!editingField) && this._renderSimpleValueInput(uiTheme)}
        </AnimatedView>

      </View>
    );
  }
}
