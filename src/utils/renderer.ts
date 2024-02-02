import fs from 'fs';
import prettier from 'prettier';

export const getRenderer = (
  handlebars: typeof Handlebars,
  outputRootPath: string,
  templateRootPath: string,
) => {
  const render = async (
    templateFile: string,
    outputFile: string,
    context: Record<string, unknown>,
  ) => {
    const outputPath = outputRootPath + '/' + outputFile;
    const templateSource = await fs.promises.readFile(
      templateRootPath + '/' + templateFile,
      'utf8',
    );
    const template = handlebars.compile(templateSource);
    let output = template(context);
    try {
      output = await prettier.format(output, {
        plugins: [require('prettier-plugin-java')],
        parser: 'java',
        proseWrap: 'always',
        singleQuote: true,
      });
    } catch (e) {
      console.error('Error formatting ' + outputPath);
    }
    await fs.promises.mkdir(outputPath.replace(/\/[^/]+$/, ''), {
      recursive: true,
    });
    await fs.promises.writeFile(outputPath, output);
  };

  return render;
};
