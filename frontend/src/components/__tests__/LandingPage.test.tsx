import "@testing-library/jest-dom";
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import Home from "@/app/page";
import HeroSection from "@/components/landing/HeroSection";
import StatsSection from "@/components/landing/StatsSection";
import HowItWorksSection from "@/components/landing/HowItWorksSection";
import FeaturedJobsCarousel from "@/components/landing/FeaturedJobsCarousel";
import CTASection from "@/components/landing/CTASection";
import axios from "axios";

// Mock child components for integration test
jest.mock("@/components/landing/HeroSection", () => () => <div data-testid="hero-section" />);
jest.mock("@/components/landing/StatsSection", () => () => <div data-testid="stats-section" />);
jest.mock("@/components/landing/HowItWorksSection", () => () => <div data-testid="how-it-works-section" />);
jest.mock("@/components/landing/FeaturedJobsCarousel", () => () => <div data-testid="featured-jobs-section" />);
jest.mock("@/components/landing/CTASection", () => () => <div data-testid="cta-section" />);

describe("Landing Page Integration", () => {
  it("renders all five sections of the landing page", () => {
    render(<Home />);
    expect(screen.getByTestId("hero-section")).toBeInTheDocument();
    expect(screen.getByTestId("stats-section")).toBeInTheDocument();
    expect(screen.getByTestId("how-it-works-section")).toBeInTheDocument();
    expect(screen.getByTestId("featured-jobs-section")).toBeInTheDocument();
    expect(screen.getByTestId("cta-section")).toBeInTheDocument();
  });
});
