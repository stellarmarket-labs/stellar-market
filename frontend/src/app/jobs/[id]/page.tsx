import { Clock, DollarSign, ArrowLeft, MessageSquare } from "lucide-react";
import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";

const mockJob = {
  id: "1",
  title: "Build Soroban DEX Frontend",
  description: `We are looking for an experienced React/Next.js developer to build the frontend for a decentralized exchange running on Soroban.

## Requirements
- Strong experience with React/Next.js and TypeScript
- Familiarity with Stellar SDK and Soroban
- Experience building DeFi interfaces (swap, liquidity pools, order books)
- Responsive design with Tailwind CSS
- Web3 wallet integration (Freighter, Albedo)

## Scope
The DEX frontend should include:
- Token swap interface with price impact calculation
- Liquidity pool management (add/remove liquidity)
- Order book view with real-time updates
- Portfolio dashboard showing user positions
- Transaction history

## Timeline
We expect this project to be completed within 6-8 weeks.`,
  budget: 5000,
  category: "Frontend",
  status: "OPEN" as const,
  createdAt: "2025-01-15T00:00:00Z",
  client: {
    id: "c1",
    walletAddress: "GABCD...WXYZ",
    username: "stellarbuilder",
    bio: "Building the future of decentralized finance on Stellar.",
    role: "CLIENT" as const,
  },
  milestones: [
    {
      id: "m1",
      jobId: "1",
      title: "UI Design & Architecture",
      description:
        "Create wireframes, component architecture, and set up the project with Next.js, Tailwind, and Stellar SDK integration.",
      amount: 1000,
      status: "PENDING" as const,
      order: 0,
    },
    {
      id: "m2",
      jobId: "1",
      title: "Core Swap & Pool Interface",
      description:
        "Build the token swap interface, liquidity pool management, and integrate with Soroban smart contracts.",
      amount: 2500,
      status: "PENDING" as const,
      order: 1,
    },
    {
      id: "m3",
      jobId: "1",
      title: "Dashboard, Testing & Deployment",
      description:
        "Build portfolio dashboard, transaction history, write tests, and deploy to production.",
      amount: 1500,
      status: "PENDING" as const,
      order: 2,
    },
  ],
};

export default function JobDetailPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <Link
        href="/jobs"
        className="flex items-center gap-2 text-dark-text hover:text-dark-heading mb-8 transition-colors"
      >
        <ArrowLeft size={18} /> Back to Jobs
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2">
          <div className="flex items-start justify-between mb-4">
            <span className="text-sm font-medium text-stellar-purple bg-stellar-purple/10 px-3 py-1 rounded">
              {mockJob.category}
            </span>
            <StatusBadge status={mockJob.status} />
          </div>

          <h1 className="text-3xl font-bold text-dark-heading mb-4">
            {mockJob.title}
          </h1>

          <div className="card mb-8">
            <h2 className="text-lg font-semibold text-dark-heading mb-4">
              Description
            </h2>
            <div className="text-dark-text whitespace-pre-line text-sm leading-relaxed">
              {mockJob.description}
            </div>
          </div>

          {/* Milestones */}
          <div className="card">
            <h2 className="text-lg font-semibold text-dark-heading mb-4">
              Milestones
            </h2>
            <div className="space-y-4">
              {mockJob.milestones.map((milestone, index) => (
                <div
                  key={milestone.id}
                  className="flex items-start gap-4 p-4 bg-dark-bg rounded-lg border border-dark-border"
                >
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-stellar-blue/20 flex items-center justify-center text-stellar-blue text-sm font-medium">
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="font-medium text-dark-heading">
                        {milestone.title}
                      </h3>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-stellar-purple font-medium">
                          {milestone.amount.toLocaleString()} XLM
                        </span>
                        <StatusBadge status={milestone.status} />
                      </div>
                    </div>
                    <p className="text-sm text-dark-text">
                      {milestone.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <DollarSign className="text-stellar-blue" size={20} />
              <span className="text-2xl font-bold text-dark-heading">
                {mockJob.budget.toLocaleString()} XLM
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm text-dark-text mb-4">
              <Clock size={14} />
              Posted {new Date(mockJob.createdAt).toLocaleDateString()}
            </div>
            <button className="btn-primary w-full">Apply for this Job</button>
          </div>

          <div className="card">
            <h3 className="font-semibold text-dark-heading mb-4">
              About the Client
            </h3>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-stellar-blue to-stellar-purple" />
              <div>
                <div className="font-medium text-dark-heading">
                  {mockJob.client.username}
                </div>
                <div className="text-xs text-dark-text">
                  {mockJob.client.walletAddress}
                </div>
              </div>
            </div>
            <p className="text-sm text-dark-text mb-4">{mockJob.client.bio}</p>
            <Link
              href={`/messages/${mockJob.client.id}-${mockJob.id}`}
              className="btn-secondary w-full flex items-center justify-center gap-2"
            >
              <MessageSquare size={18} /> Message Client
            </Link>
          </div>

          <div className="card">
            <h3 className="font-semibold text-dark-heading mb-3">
              Milestone Summary
            </h3>
            <div className="space-y-2">
              {mockJob.milestones.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-dark-text">{m.title}</span>
                  <span className="text-dark-heading font-medium">
                    {m.amount.toLocaleString()} XLM
                  </span>
                </div>
              ))}
              <div className="border-t border-dark-border pt-2 mt-2 flex items-center justify-between text-sm font-semibold">
                <span className="text-dark-heading">Total</span>
                <span className="text-stellar-purple">
                  {mockJob.budget.toLocaleString()} XLM
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
