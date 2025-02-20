type PropertyValue = string | number;

export default class Annotation {
  private packageName;
  private properties: (PropertyValue | [key: string, value: PropertyValue])[];

  constructor(
    packageName: string,
    ...properties: (PropertyValue | [key: string, value: PropertyValue])[]
  ) {
    this.packageName = packageName;
    this.properties = properties;
  }
}
