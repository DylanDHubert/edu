"use client";

import { useState, useEffect } from "react";
import { useNotes } from "../contexts/NotesContext";

export interface NotesFilter {
  portfolio: string | null;
}

interface NotesFilterProps {
  onFilterChange: (filter: NotesFilter) => void;
  currentFilter: NotesFilter;
}

export default function NotesFilter({ onFilterChange, currentFilter }: NotesFilterProps) {
  const { notes } = useNotes();
  const [portfolios, setPortfolios] = useState<string[]>([]);

  // GET UNIQUE PORTFOLIOS FROM NOTES
  useEffect(() => {
    const uniquePortfolios = Array.from(new Set(notes.map(note => note.portfolio_type))).sort();
    setPortfolios(uniquePortfolios);
  }, [notes]);

  const handlePortfolioChange = (portfolio: string | null) => {
    onFilterChange({ ...currentFilter, portfolio });
  };

  return (
    <div className="bg-slate-700 p-3 rounded-md mb-4">
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => handlePortfolioChange(null)}
          className={`px-3 py-1 text-xs rounded-full transition-colors ${
            currentFilter.portfolio === null
              ? 'bg-blue-600 text-white'
              : 'bg-slate-600 text-slate-300 hover:bg-slate-500'
          }`}
        >
          ALL PORTFOLIOS
        </button>
        {portfolios.map((portfolio) => (
          <button
            key={portfolio}
            onClick={() => handlePortfolioChange(portfolio)}
            className={`px-3 py-1 text-xs rounded-full transition-colors ${
              currentFilter.portfolio === portfolio
                ? 'bg-blue-600 text-white'
                : 'bg-slate-600 text-slate-300 hover:bg-slate-500'
            }`}
          >
            {portfolio.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );
}
