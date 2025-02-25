import { EmitContext, Model, Type } from '@typespec/compiler';
import { HttpOperationParameter } from '@typespec/http';

export type Visibility = '' | 'private' | 'protected' | 'public';

export interface EmitterOptions {
  packageName: string;
}

export type Props = {
  context: EmitContext;
  packageName: string;

  model?: Model;
  httpOperationParameters?: HttpOperationParameter[];
};
