import { describe, expect, it } from "@jest/globals";

import { canEditJobForRole } from "@/app/jobs/[id]/page";

describe("canEditJobForRole", () => {
  it("returns false for APPRENTICE role", () => {
    expect(canEditJobForRole("APPRENTICE")).toBe(false);
  });

  it("returns true for OWNER and EMPLOYEE roles", () => {
    expect(canEditJobForRole("OWNER")).toBe(true);
    expect(canEditJobForRole("EMPLOYEE")).toBe(true);
  });

  it("treats empty or null role as non-editable", () => {
    expect(canEditJobForRole(null)).toBe(false);
    expect(canEditJobForRole("")).toBe(false);
  });
});
