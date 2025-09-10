const { default: mongoose } = require("mongoose");

const removeReferencesGlobally = async (fieldName, idsToRemove) => {
    if (!idsToRemove.length) return;
  
    const models = mongoose.models;
  
    for (const modelName in models) {
      const model = models[modelName];
      const schemaPaths = model.schema.paths;
  
      const path = schemaPaths[fieldName];
  
      if (path) {
        const isArray = path.instance === 'Array';
  
        if (isArray) {
          await model.updateMany(
            { [fieldName]: { $elemMatch: { $in: idsToRemove } } },
            { $pull: { [fieldName]: { $in: idsToRemove } } }
          );
        } else {
          await model.deleteMany({ [fieldName]: { $in: idsToRemove } });
        }
      }
  
      // Optional: Scan all fields (expensive!)
      for (const key in schemaPaths) {
        if (key === fieldName) continue;
  
        const schemaType = schemaPaths[key];
  
        if (schemaType.instance === "Array" && schemaType.caster && schemaType.caster.instance === "ObjectID") {
          await model.updateMany(
            { [key]: { $elemMatch: { $in: idsToRemove } } },
            { $pull: { [key]: { $in: idsToRemove } } }
          );
        }
  
        if (schemaType.instance === "ObjectID") {
          await model.updateMany(
            { [key]: { $in: idsToRemove } },
            { $set: { [key]: null } }
          );
        }
      }
    }
  };

  module.exports = removeReferencesGlobally;