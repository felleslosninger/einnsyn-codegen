import { EmitContext, Namespace } from '@typespec/compiler';
import { JavaBaseProps } from '../../languages/java/types.js';
import { emitControllers } from './emitControllers.js';
import { emitEntityModels } from './emitEntityModels.js';
import { emitIdPrefixMap } from './emitIdPrefixMap.js';
import { emitUnknownModels } from './emitUnknownModels.js';
import { PACKAGE_NAME } from './variables.js';
import { emitExceptionModels } from './emitExceptionModels.js';

export default async function emit(
  context: EmitContext,
  eInnsynNamespace: Namespace,
) {
  const defaultProps: JavaBaseProps = {
    context,
    packageName: PACKAGE_NAME,
    entitySuffix: 'DTO',
  };

  // Emit eInnsyn entity models
  emitEntityModels(context, { ...defaultProps }, eInnsynNamespace);

  // Emit non-eInnsyn models (query parameters etc.)
  emitUnknownModels(context, { ...defaultProps }, eInnsynNamespace);

  // Emit exception models
  emitExceptionModels(context, defaultProps, eInnsynNamespace);

  // Emit controllers
  emitControllers(context, { ...defaultProps }, eInnsynNamespace);

  // Emit IdPrefixMap
  emitIdPrefixMap(context, { ...defaultProps }, eInnsynNamespace);
}
