import { EmitContext } from '@typespec/compiler';

export type Visibility = '' | 'private' | 'protected' | 'public';

export interface EmitterOptions {
  packageName: string;
}

export type Props = {
  context: EmitContext;
  packageName: string;
};
