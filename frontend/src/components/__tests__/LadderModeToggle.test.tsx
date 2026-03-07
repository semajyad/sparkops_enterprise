import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react";

import { LadderModeToggle } from "@/components/LadderModeToggle";

describe("LadderModeToggle", () => {
  it("shows active state label when enabled", () => {
    render(<LadderModeToggle enabled onChange={() => undefined} />);

    const toggle = screen.getByRole("switch", { name: /ladder mode/i });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(screen.queryByText("ACTIVE")).not.toBeNull();
  });

  it("calls onChange with next boolean value", () => {
    const onChange = jest.fn();
    render(<LadderModeToggle enabled={false} onChange={onChange} />);

    fireEvent.click(screen.getByRole("switch", { name: /ladder mode/i }));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
