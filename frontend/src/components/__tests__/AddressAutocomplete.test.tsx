import { describe, expect, it, jest, beforeEach, afterEach } from "@jest/globals";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { AddressAutocomplete } from "@/components/AddressAutocomplete";

type SuggestionSelection = {
  id: string;
  text: string;
  place_name: string;
  address: string;
  lat: number;
  lng: number;
};

function Harness({ onSelect }: { onSelect: (selection: SuggestionSelection) => void }) {
  const [value, setValue] = useState("");
  return (
    <AddressAutocomplete
      id="job-address"
      value={value}
      onChange={setValue}
      onSelect={onSelect}
      placeholder="Start typing an address"
    />
  );
}

describe("AddressAutocomplete", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.resetAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("queries mapbox directly and returns lng/lat when address is selected", async () => {
    const onSelect = jest.fn();
    const fetchMock = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        features: [
          {
            id: "feature-1",
            text: "Churchill Avenue",
            place_name: "21 Churchill Avenue, Auckland",
            center: [174.7633, -36.8485],
          },
        ],
      }),
    })) as unknown as typeof fetch;
    global.fetch = fetchMock;

    render(<Harness onSelect={onSelect} />);

    fireEvent.change(screen.getByPlaceholderText("Start typing an address"), {
      target: { value: "21 Churchill" },
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const url = String((fetchMock as unknown as jest.Mock).mock.calls[0][0]);
    expect(url).toContain("/api/mapbox/geocode?q=");

    const suggestion = await screen.findByRole("button", { name: /21 Churchill Avenue, Auckland/i });
    fireEvent.click(suggestion);

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        place_name: "21 Churchill Avenue, Auckland",
        lng: 174.7633,
        lat: -36.8485,
      }),
    );
  });

  it("should handle empty features gracefully", async () => {
    // We expect 0 calls to fetch, so we don't strictly need to mock a response, 
    // but we can provide a generic mock anyway.
    global.fetch = jest.fn().mockImplementation(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ features: [] })
    } as unknown as Response)) as jest.Mock;

    render(
      <AddressAutocomplete
        id="job-address"
        value=""
        onChange={jest.fn()}
        onSelect={jest.fn()}
        placeholder="Start typing an address"
      />
    );

    const input = screen.getByPlaceholderText("Start typing an address");
    await userEvent.type(input, "12"); // "12" is less than 3 chars, so it should abort fetch and hide suggestions

    await waitFor(() => {
      expect(global.fetch).not.toHaveBeenCalled();
    });

    const list = screen.queryByRole("list");
    expect(list).toBeNull();
  });
});
