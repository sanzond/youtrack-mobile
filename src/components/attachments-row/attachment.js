/* @flow */

import React, {PureComponent} from 'react';
import {View, ActivityIndicator, TouchableOpacity, Text, Linking, Alert} from 'react-native';
import {SvgUri} from 'react-native-svg';

import {View as AnimatedView} from 'react-native-animatable';
import ImageProgress from 'react-native-image-progress';
import Router from '../router/router';
import safariView from '../safari-view/safari-view';
import throttle from 'lodash.throttle';
import {hasMimeType} from '../mime-type/mime-type';
import {isAndroidPlatform} from '../../util/util';
import {IconRemoveFilled} from '../icon/icon';

import {HIT_SLOP} from '../common-styles/button';
import styles from './attachments-row.styles';

import type {Attachment} from '../../flow/CustomFields';
import type {UITheme} from '../../flow/Theme';

type DefaultProps = {
  imageHeaders: ?Object,
  onOpenAttachment: (type: string, name: string) => any,
  onImageLoadingError: (error: Object) => any,
  canRemoveImage?: boolean,
  onRemoveImage: (attachment: Attachment) => any,
};

type Props = DefaultProps & {
  attach: Attachment,
  attachments: Array<Attachment>,
  attachingImage: ?Object,
  uiTheme: UITheme
}

type State = {
  isRemoving: boolean
}

const ANIMATION_DURATION = 700;
const ERROR_HANDLER_THROTTLE = 60 * 1000;
const isAndroid: boolean = isAndroidPlatform();

export default class Attach extends PureComponent<Props, State> {
  static defaultProps: DefaultProps = {
    imageHeaders: null,
    canRemoveImage: false,
    onOpenAttachment: () => {},
    onImageLoadingError: () => {},
    onRemoveImage: () => {},
  };
  _isUnmounted: boolean;
  handleLoadError = throttle((err) => {
    this.props.onImageLoadingError(err);
  }, ERROR_HANDLER_THROTTLE);

  state = {isRemoving: false};

  componentDidMount() {
    this._isUnmounted = false;
  }

  componentWillUnmount() {
    this._isUnmounted = true;
  }

  showImageAttachment(attach: Attachment) {
    const {imageHeaders, onRemoveImage, attachments = [attach]} = this.props;

    this.props.onOpenAttachment('image', attach.id);

    if (isAndroid && hasMimeType.svg(attach)) {
      return this.openAttachmentUrl(attach.name, attach.url);
    }

    return Router.Image({
      imageAttachments: attachments.filter(attach => hasMimeType.previewable(attach)),
      current: attach,
      imageHeaders,
      ...(onRemoveImage ? {onRemoveImage: (currentPage: number) => onRemoveImage(attachments[currentPage])} : {})
    });
  }

  openAttachmentUrl(name: string, url: string) {
    const ATTACH_EXT_BLACK_LIST = [/\.mp4\?/, /\.m4v\?/];
    const isVideo = ATTACH_EXT_BLACK_LIST.some(reg => reg.test(url));
    this.props.onOpenAttachment('file', name);

    if (!isAndroid && !isVideo) {
      Router.AttachmentPreview({
        url,
        name,
        headers: this.props.imageHeaders
      });
    } else {
      if (!isAndroid) {
        return safariView.show({url});
      }
      Linking.openURL(url);
    }
  }

  renderSVG() {
    return (
      <View
        testID="attachmentSvg"
        style={styles.attachmentImage}>
        <SvgUri
          width="100%"
          height="100%"
          uri={this.props.attach.thumbnailURL}
        />
      </View>
    );
  }

  renderImage() {
    const {attachingImage, imageHeaders, attach} = this.props;
    const isAttachingImage = attachingImage === attach;

    const source = {
      uri: attach?.thumbnailURL || (attach?.url ? `${attach.url}&w=126&h=80` : ''),
      headers: imageHeaders
    };
    if (!source.uri) {
      return null;
    }

    return (
      <AnimatedView
        testID="attachmentImage"
        animation={isAttachingImage ? 'zoomIn' : null}
        useNativeDriver
        duration={ANIMATION_DURATION}
        easing="ease-out-quart"
      >
        <ImageProgress
          style={styles.attachmentImage}
          renderIndicator={() => <ActivityIndicator/>}
          source={source}
          onError={this.handleLoadError}
        />
        {isAttachingImage && <ActivityIndicator size="large" style={styles.imageActivityIndicator}/>}
      </AnimatedView>
    );
  }

  renderFile() {
    const {attach} = this.props;

    return (
      <View
        testID="attachmentFile"
        style={[styles.attachmentImage, styles.attachmentFile]}
      >
        <Text style={styles.attachmentName}>{attach.name}</Text>
      </View>
    );
  }

  remove = () => {
    Alert.alert(
      'Delete attachment?',
      'This action deletes the attachment permanently and cannot be undone.',
      [
        {
          text: 'Cancel'
        },
        {
          text: 'Delete',
          onPress: async () => {
            this.setState({isRemoving: true});
            await this.props.onRemoveImage(this.props.attach);
            if (!this._isUnmounted) {
              this.setState({isRemoving: false});
            }
          }
        }
      ],
      {cancelable: true}
    );
  };

  onAttachPress = () => {
    const {attach} = this.props;
    if (this.isImage() || this.isSVG()) {
      this.showImageAttachment(attach);
    } else {
      this.openAttachmentUrl(attach.name, attach.url);
    }
  };

  isImage() {
    return hasMimeType.image(this.props.attach);
  }

  isSVG() {
    return hasMimeType.svg(this.props.attach);
  }

  render() {
    const {attach, canRemoveImage, uiTheme} = this.props;
    const isImage = this.isImage();
    const isSvg = this.isSVG();

    return (
      <View
        key={attach.id}
        style={this.state.isRemoving ? styles.removingAttach : null}
      >
        <TouchableOpacity
          testID="attachment"
          onPress={this.onAttachPress}
        >
          {isSvg && this.renderSVG()}
          {Boolean(isImage && !isSvg) && this.renderImage()}
          {Boolean(!isImage && !isSvg) && this.renderFile()}

        </TouchableOpacity>

        {this.state.isRemoving && <ActivityIndicator style={styles.removeButton} color={uiTheme.colors.$link}/>}
        {!this.state.isRemoving && canRemoveImage && (
          <TouchableOpacity
            style={styles.removeButton}
            hitSlop={HIT_SLOP}
            disabled={this.state.isRemoving}
            testID="attachmentRemove"
            onPress={this.remove}
          >
            <IconRemoveFilled
              size={24}
              color={this.state.isRemoving ? uiTheme.colors.$disabled : uiTheme.colors.$link}
            />

          </TouchableOpacity>
        )}
      </View>
    );
  }
}
