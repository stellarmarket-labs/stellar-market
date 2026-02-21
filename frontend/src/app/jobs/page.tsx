"use client";

import { useState, useEffect, useCallback } from "react";
import { Search } from "lucide-react";
import axios from "axios";
import JobCard from "@/components/JobCard";
import Pagination from "@/components/Pagination";
import { Job, PaginatedResponse } from "@/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";
const JOBS_PER_PAGE = 10;

const categories = ["All", "Frontend", "Backend", "Smart Contract", "Design", "Mobile", "Documentation"];

export default function JobsPage() {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [page, setPage] = useState(1);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = {
        page,
        limit: JOBS_PER_PAGE,
      };
      if (selectedCategory !== "All") params.category = selectedCategory;
      if (search) params.search = search;

      const res = await axios.get<PaginatedResponse<Job>>(`${API_URL}/jobs`, { params });
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
  }, [page, selectedCategory, search]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // Reset to page 1 when filters change
  const handleCategoryChange = (cat: string) => {
    setSelectedCategory(cat);
    setPage(1);
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-dark-heading mb-8">
        Browse Jobs
      </h1>

      {/* Search & Filters */}
      <div className="flex flex-col md:flex-row gap-4 mb-8">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-text" size={18} />
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
                  : "bg-dark-card border border-dark-border text-dark-text hover:border-stellar-blue"
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
            <div key={i} className="animate-pulse bg-dark-card border border-dark-border rounded-xl h-64" />
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
        <div className="text-center py-20 text-dark-text">
          No jobs found matching your criteria.
        </div>
      )}
    </div>
  );
}
