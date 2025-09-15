const mongoose = require("mongoose");
const { ConflictError } = require("../utils/customErrors");

/**
 * Check if a document is referenced in any collection before deletion
 * @param {String} targetId - The ID of the document you want to delete
 * @param {String[]} refFields - The possible reference field names (e.g. ["courseId", "moduleId"])
 */
async function checkDependencies(docName,targetId, refFields = []) {
  const modelNames = mongoose.modelNames();

  for (const modelName of modelNames) {
    const Model = mongoose.model(modelName);

    for (const field of refFields) {
      const exists = await Model.exists({ [field]: targetId });
      if (exists) {
        throw new ConflictError(
          `Can't delete this ${docName} as dependencies found`
        );
      }
    }
  }
}

module.exports = checkDependencies;
