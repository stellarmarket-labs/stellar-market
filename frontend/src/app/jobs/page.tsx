"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import axios from "axios";
import JobCard from "@/components/JobCard";
import Pagination from "@/components/Pagination";
import FilterSidebar from "@/components/FilterSidebar";
import { useJobFilters } from "@/hooks/useJobFilters";
import { Job, PaginatedResponse } from "@/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";
const JOBS_PER_PAGE = 10;

function JobsContent() {
  const {
    filters,
    debouncedSearch,
    updateFilter,
    updateSearch,
    toggleArrayFilter,
    clearAll,
    activeCount,
    postedAfterDate,
  } = useJobFilters();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = {
        page: filters.page,
        limit: JOBS_PER_PAGE,
      };

      if (filters.sort !== "newest") params.sort = filters.sort;
      if (debouncedSearch) params.search = debouncedSearch;
      if (filters.skills.length) params.skills = filters.skills.join(",");
      if (filters.status.length) params.status = filters.status.join(",");
      if (filters.minBudget) params.minBudget = Number(filters.minBudget);
      if (filters.maxBudget) params.maxBudget = Number(filters.maxBudget);
      if (postedAfterDate) params.postedAfter = postedAfterDate;

      const res = await axios.get<PaginatedResponse<Job>>(`${API_URL}/jobs`, {
        params,
      });
      setJobs(res.data.data);
      setTotal(res.data.total);
      setTotalPages(res.data.totalPages);
    } catch {
      setJobs([]);
      setTotal(0);
      setTotalPages(0);
    } finally {
      setLoading(false);
    }
  }, [
    filters.page,
    filters.sort,
    filters.skills,
    filters.status,
    filters.minBudget,
    filters.maxBudget,
    debouncedSearch,
    postedAfterDate,
  ]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const start = total > 0 ? (filters.page - 1) * JOBS_PER_PAGE + 1 : 0;
  const end = Math.min(filters.page * JOBS_PER_PAGE, total);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-theme-heading mb-8">
        Browse Jobs
      </h1>

      {/* Search & Filters */}
      <div className="flex flex-col md:flex-row gap-4 mb-8">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-text" size={18} />
          <input
            type="text"
            placeholder="Search jobs..."
            className="input-field pl-10"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => handleCategoryChange(cat)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedCategory === cat
                  ? "bg-stellar-blue text-white"
                  : "bg-theme-card border border-theme-border text-theme-text hover:border-stellar-blue"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Job Listings */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="animate-pulse bg-theme-card border border-theme-border rounded-xl h-64" />
          ))}
        </div>
      ) : jobs.length > 0 ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            limit={JOBS_PER_PAGE}
            onPageChange={setPage}
          />
        </>
      ) : (
        <div className="text-center py-20 text-theme-text">
          No jobs found matching your criteria.
        </div>
      </div>
    </div>
  );
}

export default function JobsPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="animate-pulse bg-dark-card rounded-xl h-96" />
        </div>
      }
    >
      <JobsContent />
    </Suspense>
  );
}
