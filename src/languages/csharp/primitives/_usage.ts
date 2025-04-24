import { CSharpFile } from "./csharpfile.js";
import CSharpClass from "./class.js";
import CSharpField from "./field.js";
import CSharpProperty from "./property.js";
import CSharpMethod from "./method.js";
import CSharpParameter from "./parameter.js";
import CSharpConstructor from "./constructor.js";
import CSharpEnum from "./enum.js";
import CSharpAttribute from "./attribute.js";

const myFile = new CSharpFile("MyCompany.MyApp.Models");

const myEnum = new CSharpEnum(myFile, "Status")
	.setAccessModifier("public")
	.addValue("Pending", "Processing", "Completed", "Failed")
	.setDocumentation("Represents the status of an operation.");
myFile.addEnum(myEnum); // Enum needs parent for usings

const myClass = new CSharpClass(myFile, "User") // Class needs parent for usings
	.setAccessModifier("public")
	.setPartial(true)
	.setDocumentation("Represents a user in the system.")
	.addInterface("IEquatable<User>", "IDisposable")
	.addGeneric("TKey")
	.addAttribute(new CSharpAttribute("Serializable", "System")) // Attribute with namespace
	.addAttribute(
		new CSharpAttribute(
			"DebuggerDisplay",
			"System.Diagnostics",
			`"Id = {Id}, Name = {Name}"`,
		),
	); // Attribute with args

const idField = new CSharpField(myClass, "TKey", "_id")
	.setAccessModifier("private")
	.setReadOnly(true);

const nameProperty = new CSharpProperty(myClass, "string", "Name")
	.setAccessModifier("public")
	.setDocumentation("The name of the user.")
	.setGetter(true) // Auto-getter
	.setSetter({ modifier: "private" }); // Private auto-setter `{ get; private set; }`

const emailProperty = new CSharpProperty(myClass, "string", "Email")
	.setAccessModifier("public")
	.setInitializer(`"default@example.com"`); // Auto-property with initializer

const statusProperty = new CSharpProperty(myClass, "Status", "CurrentStatus")
	.setAccessModifier("public")
	.setInitializer("Status.Pending"); // Initialize with enum value

const ctor = new CSharpConstructor(myClass)
	.setAccessModifier("public")
	.addParameter(new CSharpParameter(myClass, "TKey", "id")) // Parameter needs parent (method/ctor) for usings
	.addParameter(new CSharpParameter(myClass, "string", "name"))
	.setBaseCall("this(id, name, Status.Pending)") // Example this call
	.addBody(
		"// Primary constructor logic if needed (or leave empty if chaining)",
	);

const ctor2 = new CSharpConstructor(myClass)
	.setAccessModifier("public")
	.addParameter(new CSharpParameter(myClass, "TKey", "id"))
	.addParameter(new CSharpParameter(myClass, "string", "name"))
	.addParameter(new CSharpParameter(myClass, "Status", "initialStatus"))
	.addBody(
		"this._id = id;",
		"this.Name = name ?? throw new ArgumentNullException(nameof(name));",
		"this.CurrentStatus = initialStatus;",
	)
	.setDocumentation("Creates a new User instance.");

const updateMethod = new CSharpMethod(myClass, "void", "UpdateName")
	.setAccessModifier("public")
	.addParameter(new CSharpParameter(myClass, "string", "newName"))
	.addBody("this.Name = newName;")
	.setDocumentation("Updates the user's name.");

const disposeMethod = new CSharpMethod(myClass, "void", "Dispose")
	.setAccessModifier("public")
	.addBody("// Dispose managed resources")
	.setDocumentation(
		"Performs application-defined tasks associated with freeing, releasing, or resetting unmanaged resources.",
	);

myClass.addField(idField);
myClass.addProperty(nameProperty, emailProperty, statusProperty);
myClass.addConstructor(ctor, ctor2); // Add constructors
myClass.addMethod(updateMethod, disposeMethod);

myFile.addClass(myClass);

console.log(myFile.toString());
