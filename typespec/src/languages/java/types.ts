import { Model } from '@typespec/compiler';
import { Props } from '../../types.js';
import JavaPrimitive from './primitives/javaprimitive.js';
import { HttpOperationParameter } from '@typespec/http';

export type JavaBaseProps = Props & {
  entitySuffix?: string;
};

export type JavaProps = JavaBaseProps & {
  parent?: JavaPrimitive;
  wrapExpandableFields?: boolean;
  validate?: boolean;
  className?: string;
  addFieldVariables?: boolean;
  addGetters?: boolean;
  addSetters?: boolean;
  addConstructors?: boolean;
  addBuilder?: boolean;
  addSubModels?: boolean;
  addLombokGetters?: boolean;
  addLombokSetters?: boolean;
  addInlineEnums?: boolean;
  isBuilder?: boolean;
  skipReadOnlyProperties?: boolean;
  setDefaultValues?: boolean;
  visibility?: 'public' | 'protected' | 'private';
};

export type JavaPropsWithModel = JavaProps & { model: Model };
