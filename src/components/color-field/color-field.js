import {View, Text, StyleSheet} from 'react-native';
import React, {PropTypes} from 'react';
import getColorById from './color-field__colors';

export const SIZE = 22;

export default class ColorField extends React.Component {
  _getBackgroundColor() {
    return this.props.color && getColorById(this.props.color.id).backgroundColor;
  }

  _getForegroundColor() {
    return this.props.color && getColorById(this.props.color.id).color;
  }

  _getFieldLetter() {
    return this.props.fullText ? this.props.text : this.props.text.substr(0, 1);
  }

  render() {
    return (
      <View style={[styles.wrapper, {backgroundColor: this._getBackgroundColor()}, this.props.style]}>
        <Text style={[styles.text, {color: this._getForegroundColor()}]}>{this._getFieldLetter()}</Text>
      </View>
    );
  }
}

ColorField.propTypes = {
  text: PropTypes.string.isRequired,
  color: PropTypes.object.isRequired,
  fullText: PropTypes.bool
};

const styles = StyleSheet.create({
  wrapper: {
    width: SIZE,
    height: SIZE,
    borderRadius: 4,
    flex: 1,
    justifyContent: 'center'
  },
  text: {
    fontSize: 12,
    textAlign: 'center'
  }
});
