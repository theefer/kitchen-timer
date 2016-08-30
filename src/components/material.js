import {h} from 'virtual-dom';
import {button} from './base';

export function materialIcon(iconName, attrs = {}) {
    const className = 'material-icons ' + (attrs.className || '');
    return h('i', {className: className}, iconName);
}

export function materialIconButton (iconName, label, attrs = {}) {
    const icon = materialIcon(iconName);
    const className = 'icon-button ' + (attrs.className || '');
    const fullAttrs = Object.assign({title: label}, attrs, {className});
    return button(icon, fullAttrs);
}

export function materialLabelledIconButton(iconName, label, attrs = {}) {
    const icon = materialIcon(iconName);
    const className = 'icon-button icon-button-labelled ' + (attrs.className || '');
    const fullAttrs = Object.assign({}, attrs, {className});
    return button([icon, label], fullAttrs);
}
