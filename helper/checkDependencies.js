const mongoose = require("mongoose");
const { ConflictError } = require("../utils/customErrors");

/**
 * Check if a document is referenced in any collection before deletion
 * @param {String} targetId 
 * @param {String[]} refFields 
 */
async function checkDependencies(docName,targetId, refFields = []) {
  const modelNames = mongoose.modelNames();

  for (const modelName of modelNames) {
    const Model = mongoose.model(modelName);

    for (const field of refFields) {
      const exists = await Model.exists({ [field]: targetId });
      if (exists) {
        console.log(field,modelName)
        throw new ConflictError(
          `Can't delete this ${docName} as dependencies found`
        );
      }
    }
  }
}

module.exports = checkDependencies;
