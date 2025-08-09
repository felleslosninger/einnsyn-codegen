/**
 * Base class for all language primitives
 * Provides the foundation for language-specific code generation elements
 */
export abstract class Primitive {
  /**
   * Abstract method that must be implemented by derived classes
   * to render the code representation in the target language
   */
  public abstract toString(): string;
}