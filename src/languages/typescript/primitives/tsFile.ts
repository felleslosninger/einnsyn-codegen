import path from "path";
import type { TSImportType } from "../types.js";
import type TSClass from "./tsClass.js";
import type TSInterface from "./tsInterface.js";
import TSPrimitive from "./tsPrimitive.js";
import type TSFunction from "./tsFunction.js";

export type ClassWrapperType = {
	clazz: TSClass;
	isExported?: boolean;
};

export type InterfaceWrapperType = {
	int: TSInterface;
	isExported?: boolean;
};

export type FunctionWrapperType = {
	func: TSFunction;
	isExported?: boolean;
};

export class TSFile extends TSPrimitive {
	private header = `
// Auto-generated from our API specification
// https://github.com/felleslosninger/einnsyn-api-spec
  `.trim();

	pathName: string;
	classes: ClassWrapperType[] = [];
	interfaces: InterfaceWrapperType[] = [];
	functions: FunctionWrapperType[] = [];
	exportFrom: {
		modulePath: string;
		exports: {
			name: string;
			isType: boolean;
		}[];
	}[] = [];

	constructor(pathName: string) {
		super(undefined);
		this.pathName = pathName;
	}

	addImport(...imports: TSImportType[]) {
		for (const { modulePath, importList, isType } of imports) {
			// Don't import self
			if (modulePath === this.pathName) {
				continue;
			}
			const directory = path.dirname(`${this.pathName}`);
			let relativePath = path.relative(directory, modulePath);
			if (!relativePath.startsWith(".")) {
				relativePath = `./${relativePath}`;
			}

			// If this is a no-type import, remove any type imports for the same path/import
			if (!isType) {
				const existingModuleImport = this.imports.find(
					({ modulePath: searchPath, isType: searchIsType }) =>
						relativePath === searchPath && searchIsType,
				);
				if (existingModuleImport) {
					// Remove all imports that are in the incoming importList
					existingModuleImport.importList =
						existingModuleImport.importList.filter(
							(importName) => !importList.includes(importName),
						);
				}
			}

			// If we've already imported the same path with 'isType'
			const existingImport = this.imports.find(
				({ modulePath: searchPath, isType: searchIsType }) =>
					relativePath === searchPath && isType === searchIsType,
			);
			if (existingImport) {
				const notImported = importList.filter(
					(importName) => !existingImport.importList.includes(importName),
				);
				existingImport.importList.push(...notImported);
			} else {
				this.imports.push({ modulePath: relativePath, importList, isType });
			}
		}
		return this;
	}

	printImports() {
		return this.imports
			.map(({ modulePath, importList, isType }) => {
				if (importList.length > 0) {
					return `import ${isType ? "type " : ""}{${importList.join(", ")}} from '${modulePath}';`;
				}
			})
			.filter((l) => l !== undefined)
			.join("\n");
	}

	addExportFrom(
		modulePath: string,
		exports: { name: string; isType: boolean }[],
	) {
		const existingModule = this.exportFrom.find(
			(i) => i.modulePath === modulePath,
		);
		if (existingModule) {
			for (const { name, isType } of exports) {
				const existingExport = existingModule.exports.find(
					(i) => i.name === name,
				);
				// If we're already exporting the type, and the new export is not a type, remove the type export
				if (existingExport && !isType) {
					existingExport.isType = false;
				} else if (!existingExport) {
					existingModule.exports.push({ name, isType });
				}
			}
		} else {
			const module = {
				modulePath,
				// Make a copy:
				exports: exports.map(({ name, isType }) => ({ name, isType })),
			};
			this.exportFrom.push(module);
		}
		return this;
	}

	printExportFrom() {
		return this.exportFrom
			.sort((a, b) => a.modulePath.localeCompare(b.modulePath))
			.map(({ modulePath, exports }) => {
				if (exports.length > 0) {
					const hasNonTypeExports = exports.some((e) => !e.isType);
					const exportStatement = hasNonTypeExports
						? "export "
						: "export type ";
					const exportList = exports.map(
						({ name, isType }) =>
							`${isType && hasNonTypeExports ? "type " : ""}${name}`,
					);
					return `${exportStatement}{${exportList.join(", ")}} from '${modulePath}';`;
				}
			})
			.filter((l) => l !== undefined)
			.join("\n");
	}

	addClass({ clazz, isExported = false }: ClassWrapperType) {
		this.classes.push({ clazz, isExported });
		return this;
	}

	addInterface({ int, isExported = true }: InterfaceWrapperType) {
		this.interfaces.push({ int, isExported });
		return this;
	}

	addFunction(func: TSFunction, isExported = true) {
		this.functions.push({ func, isExported });
		return this;
	}

	toString(): string {
		return [
			this.header,
			"",

			this.printImports(),
			"",

			this.printExportFrom(),
			"",

			...this.classes.map(
				({ clazz, isExported }) =>
					`${isExported ? "export " : ""}${clazz.toString()}\n`,
			),
			"",

			...this.interfaces.map(
				({ int, isExported }) =>
					`${isExported ? "export " : ""}${int.toString()}\n`,
			),

			...this.functions.map(
				({ func, isExported }) =>
					`${isExported ? "export " : ""}function ${func.toString()}\n`,
			),
		]
			.filter((l) => l !== undefined)
			.join("\n");
	}
}
