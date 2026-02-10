// Version comparison utilities for OTA updates

// Parse a version string into numeric components
function parseVersion(version) {
  if (!version || typeof version !== "string") {
    return { major: 0, minor: 0, patch: 0 };
  }

  const parts = version.split(".").map((p) => parseInt(p, 10) || 0);
  return {
    major: parts[0] || 0,
    minor: parts[1] || 0,
    patch: parts[2] || 0,
  };
}

// Compare two version strings
function compareVersions(v1, v2) {
  const parsed1 = parseVersion(v1);
  const parsed2 = parseVersion(v2);

  if (parsed1.major !== parsed2.major) {
    return parsed1.major > parsed2.major ? 1 : -1;
  }
  if (parsed1.minor !== parsed2.minor) {
    return parsed1.minor > parsed2.minor ? 1 : -1;
  }
  if (parsed1.patch !== parsed2.patch) {
    return parsed1.patch > parsed2.patch ? 1 : -1;
  }
  return 0;
}

// Check if version is exactly equal to target
function isVersionEqual(version, target) {
  return compareVersions(version, target) === 0;
}

// Check if version is less than target
function isVersionLessThan(version, target) {
  return compareVersions(version, target) < 0;
}

// Check if version is greater than target
function isVersionGreaterThan(version, target) {
  return compareVersions(version, target) > 0;
}

module.exports = {
  parseVersion,
  compareVersions,
  isVersionEqual,
  isVersionLessThan,
  isVersionGreaterThan,
};
