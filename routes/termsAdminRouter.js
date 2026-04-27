const express = require("express");
const multer = require("multer");
const {
  listTemplates,
  createTemplate,
  getTemplateDetail,
  saveTemplateFields,
  updateTemplateStatus,
  updateTemplateTitle,
  sendInvite,
  listEnvelopes,
  getEnvelopeDetail,
  deleteTemplate,
} = require("../controllers/termsAdminController");
const {
  requireAdminPermission,
} = require("../middlewares/admin_permission_middleware");
const { ADMIN_MODULES, ADMIN_ACTIONS } = require("../constants/adminPermissions");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

router.use(requireAdminPermission(ADMIN_MODULES.TERMS, ADMIN_ACTIONS.VIEW));

router.get("/templates", listTemplates);
router.post(
  "/templates",
  requireAdminPermission(ADMIN_MODULES.TERMS, ADMIN_ACTIONS.EDIT),
  upload.single("file"),
  createTemplate,
);
router.get("/templates/:templateId", getTemplateDetail);
router.put(
  "/templates/:templateId/fields",
  requireAdminPermission(ADMIN_MODULES.TERMS, ADMIN_ACTIONS.EDIT),
  saveTemplateFields,
);
router.patch(
  "/templates/:templateId/status",
  requireAdminPermission(ADMIN_MODULES.TERMS, ADMIN_ACTIONS.EDIT),
  updateTemplateStatus,
);
router.patch(
  "/templates/:templateId/title",
  requireAdminPermission(ADMIN_MODULES.TERMS, ADMIN_ACTIONS.EDIT),
  updateTemplateTitle,
);
router.delete(
  "/templates/:templateId",
  requireAdminPermission(ADMIN_MODULES.TERMS, ADMIN_ACTIONS.EDIT),
  deleteTemplate,
);
router.post(
  "/templates/:templateId/send",
  requireAdminPermission(ADMIN_MODULES.TERMS, ADMIN_ACTIONS.EDIT),
  sendInvite,
);

router.get("/envelopes", listEnvelopes);
router.get("/envelopes/:envelopeId", getEnvelopeDetail);

module.exports = router;
