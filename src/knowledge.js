
const fs = require("node:fs");
const path = require("node:path");

const registryPath = path.join(__dirname, "..", "data", "knowledge.json");

function getKnowledgeStatus() {
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));

  if (!Array.isArray(registry.sources)) {
    throw new Error("Invalid knowledge registry.");
  }

  const now = Date.now();

  const eligible = registry.sources.filter(source => {
    if (
      source.approved !== true ||
      source.approvedForAI !== true ||
      source.authorityStatus !== "approved" ||
      !source.id ||
      !source.title ||
      !source.owner ||
      !source.version ||
      !source.reviewDate ||
      typeof source.content !== "string" ||
      !source.content.trim()
    ) {
      return false;
    }

    const reviewDate = Date.parse(source.reviewDate);
    const cycle = Number(
      source.reviewCycleDays || registry.reviewCycleDays
    );

    if (
      !Number.isFinite(reviewDate) ||
      !Number.isFinite(cycle) ||
      cycle <= 0 ||
      reviewDate > now
    ) {
      return false;
    }

    return now - reviewDate <= cycle * 86400000;
  });

  return {
    owner: registry.contentOwner,
    reviewCycleDays: registry.reviewCycleDays,
    total: registry.sources.length,
    eligible,
    ineligible: registry.sources.length - eligible.length
  };
}

module.exports = { getKnowledgeStatus };
