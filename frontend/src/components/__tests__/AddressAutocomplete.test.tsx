import { describe, expect, it, jest, beforeEach, afterEach } from "@jest/globals";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  const originalMapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const testMapboxToken = "test-mapbox-public-token";

  beforeEach(() => {
    jest.resetAllMocks();
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN = testMapboxToken;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN = originalMapboxToken;
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
    expect(url).toContain("https://api.mapbox.com/geocoding/v5/mapbox.places/");
    expect(url).toContain(`access_token=${testMapboxToken}`);

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

  it("logs an error when mapbox returns an empty feature set", async () => {
    const onSelect = jest.fn();
    const fetchMock = jest.fn(async () => ({
      ok: true,
      json: async () => ({ features: [] }),
    })) as unknown as typeof fetch;
    global.fetch = fetchMock;

    const errorSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);

    render(<Harness onSelect={onSelect} />);

    fireEvent.change(screen.getByPlaceholderText("Start typing an address"), {
      target: { value: "21 Churchill" },
    });

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith(
        "[AddressAutocomplete] Mapbox returned an empty features array for query:",
        "21 Churchill"
      );
    });

    errorSpy.mockRestore();
  });
});
