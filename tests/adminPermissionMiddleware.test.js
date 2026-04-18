const {
  requireAdminPermission,
} = require("../middlewares/admin_permission_middleware");

describe("admin permission middleware", () => {
  test("allows super admin", () => {
    const middleware = requireAdminPermission("events", "view");
    const req = { user: { role: "super_admin" }, adminAccess: {} };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test("blocks admin without module action", () => {
    const middleware = requireAdminPermission("events", "edit");
    const req = {
      user: { role: "admin" },
      adminAccess: { permissions: { events: ["view"] } },
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    middleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
