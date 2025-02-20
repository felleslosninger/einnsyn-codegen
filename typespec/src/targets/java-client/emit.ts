import { EmitContext, Namespace } from '@typespec/compiler';
import { Props } from '../../types.js';
import { emitEntityModels } from './emitEntityModels.js';
import { emitExceptionModels } from './emitExceptionModels.js';
import { emitOperations } from './emitOperations.js';
import { emitUnknownModels } from './emitUnknownModels.js';
import { PACKAGE_NAME } from './variables.js';
import { emitClientBase } from './emitClientBase.js';

export default async function emit(
  context: EmitContext,
  eInnsynNamespace: Namespace,
) {
  const defaultProps: Props = {
    context,
    packageName: PACKAGE_NAME,
  };

  // Emit eInnsyn entity models
  emitEntityModels(context, defaultProps, eInnsynNamespace);

  // Emit non-eInnsyn models (query parameters etc.)
  emitUnknownModels(context, defaultProps, eInnsynNamespace);

  // Emit exception models
  emitExceptionModels(context, defaultProps, eInnsynNamespace);

  // Emit resources
  emitOperations(context, defaultProps, eInnsynNamespace);

  // Emit EInnsynClientBase
  emitClientBase(context, defaultProps, eInnsynNamespace);
}
