import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import axios from "axios";
import UnsubscribePage from "../page";

jest.mock("axios", () => ({
  get: jest.fn(),
}));
const mockedAxios = axios as jest.Mocked<typeof axios>;

const mockSearchParams = new URLSearchParams();
jest.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
}));

jest.mock("next/link", () => {
  const React = require("react");
  return ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  );
});

function setToken(token: string | null) {
  mockSearchParams.delete("token");
  if (token !== null) mockSearchParams.set("token", token);
}

describe("UnsubscribePage (#1210)", () => {
  beforeEach(() => {
    mockedAxios.get.mockReset();
    setToken(null);
  });

  it("calls the backend API with the token and shows the success state", async () => {
    setToken("valid-jwt");
    mockedAxios.get.mockResolvedValueOnce({ status: 200 });

    render(<UnsubscribePage />);

    await waitFor(() => {
      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringMatching(/\/unsubscribe\?token=valid-jwt$/),
      );
    });

    await waitFor(() => {
      expect(screen.getByText("Unsubscribed")).toBeInTheDocument();
    });
  });

  it("shows the invalid state when no token is provided", async () => {
    render(<UnsubscribePage />);

    await waitFor(() => {
      expect(
        screen.getByText("Link invalid or expired"),
      ).toBeInTheDocument();
    });
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it("shows the invalid state when the backend rejects the token with 400", async () => {
    setToken("expired-jwt");
    mockedAxios.get.mockRejectedValueOnce({
      response: { status: 400 },
    });

    render(<UnsubscribePage />);

    await waitFor(() => {
      expect(
        screen.getByText("Link invalid or expired"),
      ).toBeInTheDocument();
    });
  });

  it("shows a generic error on unexpected failures", async () => {
    setToken("valid-jwt");
    mockedAxios.get.mockRejectedValueOnce(new Error("network down"));

    render(<UnsubscribePage />);

    await waitFor(() => {
      expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    });
  });
});
