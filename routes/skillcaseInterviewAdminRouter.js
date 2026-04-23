const express = require("express");
const router = express.Router();
const {
  listPositions,
  getPositionById,
  getUploadUrl,
  createPosition,
  duplicatePosition,
  updatePosition,
  updatePositionStatus,
  getCandidatesByPosition,
  getCandidateSubmissionDetail,
  reviewCandidateSubmission,
  deletePosition,
} = require("../controllers/skillcaseInterviewAdminController");
const {
  requireAdminPermission,
} = require("../middlewares/admin_permission_middleware");
const {
  ADMIN_MODULES,
  ADMIN_ACTIONS,
} = require("../constants/adminPermissions");

router.get(
  "/positions",
  requireAdminPermission(
    ADMIN_MODULES.SKILLCASE_INTERVIEWS,
    ADMIN_ACTIONS.VIEW,
  ),
  listPositions,
);
router.get(
  "/positions/:positionId",
  requireAdminPermission(
    ADMIN_MODULES.SKILLCASE_INTERVIEWS,
    ADMIN_ACTIONS.VIEW,
  ),
  getPositionById,
);
router.post(
  "/upload-url",
  requireAdminPermission(
    ADMIN_MODULES.SKILLCASE_INTERVIEWS,
    ADMIN_ACTIONS.EDIT,
  ),
  getUploadUrl,
);
router.post(
  "/positions",
  requireAdminPermission(
    ADMIN_MODULES.SKILLCASE_INTERVIEWS,
    ADMIN_ACTIONS.CREATE,
  ),
  createPosition,
);
router.post(
  "/positions/:positionId/duplicate",
  requireAdminPermission(
    ADMIN_MODULES.SKILLCASE_INTERVIEWS,
    ADMIN_ACTIONS.CREATE,
  ),
  duplicatePosition,
);
router.put(
  "/positions/:positionId",
  requireAdminPermission(
    ADMIN_MODULES.SKILLCASE_INTERVIEWS,
    ADMIN_ACTIONS.EDIT,
  ),
  updatePosition,
);
router.delete(
  "/positions/:positionId",
  requireAdminPermission(
    ADMIN_MODULES.SKILLCASE_INTERVIEWS,
    ADMIN_ACTIONS.DELETE,
  ),
  deletePosition,
);
router.patch(
  "/positions/:positionId/status",
  requireAdminPermission(
    ADMIN_MODULES.SKILLCASE_INTERVIEWS,
    ADMIN_ACTIONS.EDIT,
  ),
  updatePositionStatus,
);
router.get(
  "/positions/:positionId/candidates",
  requireAdminPermission(
    ADMIN_MODULES.SKILLCASE_INTERVIEWS,
    ADMIN_ACTIONS.VIEW,
  ),
  getCandidatesByPosition,
);
router.get(
  "/positions/:positionId/candidates/:submissionId",
  requireAdminPermission(
    ADMIN_MODULES.SKILLCASE_INTERVIEWS,
    ADMIN_ACTIONS.VIEW,
  ),
  getCandidateSubmissionDetail,
);
router.patch(
  "/positions/:positionId/candidates/:submissionId/review",
  requireAdminPermission(
    ADMIN_MODULES.SKILLCASE_INTERVIEWS,
    ADMIN_ACTIONS.EDIT,
  ),
  reviewCandidateSubmission,
);

module.exports = router;
