"use client";

import { useState, useEffect } from "react";
import { useNotes } from "../contexts/NotesContext";
import { getTagColor, getTagDisplayName } from "../utils/notes";

export interface NotesFilter {
  portfolio: string | null;
  account: string[];
  team: string[];
}

interface NotesFilterProps {
  currentPortfolio: string | null;
  filters: NotesFilter;
  onFiltersChange: (filters: NotesFilter) => void;
}

export default function NotesFilter({ currentPortfolio, filters, onFiltersChange }: NotesFilterProps) {
  const { getUniqueTags } = useNotes();
  const [uniqueTags, setUniqueTags] = useState<{ [key: string]: string[] }>({});
  const [expandedCategories, setExpandedCategories] = useState<{ [key: string]: boolean }>({});

  // LOAD UNIQUE TAGS
  useEffect(() => {
    setUniqueTags(getUniqueTags());
  }, [getUniqueTags]);

  // TOGGLE CATEGORY EXPANSION
  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  // UPDATE FILTERS
  const updateFilter = (category: keyof NotesFilter, value: string | string[]) => {
    onFiltersChange({
      ...filters,
      [category]: value
    });
  };

  // TOGGLE TAG SELECTION
  const toggleTag = (category: 'account' | 'team', tag: string) => {
    const currentTags = filters[category] || [];
    const newTags = currentTags.includes(tag)
      ? currentTags.filter(t => t !== tag)
      : [...currentTags, tag];
    
    updateFilter(category, newTags);
  };

  // CLEAR ALL FILTERS
  const clearAllFilters = () => {
    onFiltersChange({
      portfolio: currentPortfolio,
      account: [],
      team: []
    });
  };

  // CHECK IF ANY FILTERS ARE ACTIVE
  const hasActiveFilters = filters.account.length > 0 || 
                          filters.team.length > 0;

  return (
    <div className="p-4 border-b border-slate-700">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-300">FILTERS</h3>
        {hasActiveFilters && (
          <button
            onClick={clearAllFilters}
            className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            CLEAR ALL
          </button>
        )}
      </div>

      {/* ACCOUNT FILTER */}
      <div className="mb-3">
        <button
          onClick={() => toggleCategory('account')}
          className="flex items-center justify-between w-full text-xs text-slate-300 hover:text-slate-100 transition-colors"
        >
          <span>ACCOUNT</span>
          <span className={`transform transition-transform ${expandedCategories.account ? 'rotate-180' : ''}`}>
            ▼
          </span>
        </button>
        {expandedCategories.account && (
          <div className="mt-2 space-y-1">
            {uniqueTags.account?.length > 0 ? (
              uniqueTags.account.map(tag => (
                <label key={tag} className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.account.includes(tag)}
                    onChange={() => toggleTag('account', tag)}
                    className="w-3 h-3 text-slate-600 bg-slate-700 border-slate-600 rounded focus:ring-slate-500"
                  />
                  <span className="text-xs text-slate-400">{tag}</span>
                </label>
              ))
            ) : (
              <span className="text-xs text-slate-500">NO ACCOUNT TAGS</span>
            )}
          </div>
        )}
      </div>

      {/* TEAM FILTER */}
      <div className="mb-3">
        <button
          onClick={() => toggleCategory('team')}
          className="flex items-center justify-between w-full text-xs text-slate-300 hover:text-slate-100 transition-colors"
        >
          <span>TEAM</span>
          <span className={`transform transition-transform ${expandedCategories.team ? 'rotate-180' : ''}`}>
            ▼
          </span>
        </button>
        {expandedCategories.team && (
          <div className="mt-2 space-y-1">
            {uniqueTags.team?.length > 0 ? (
              uniqueTags.team.map(tag => (
                <label key={tag} className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.team.includes(tag)}
                    onChange={() => toggleTag('team', tag)}
                    className="w-3 h-3 text-slate-600 bg-slate-700 border-slate-600 rounded focus:ring-slate-500"
                  />
                  <span className="text-xs text-slate-400">{tag}</span>
                </label>
              ))
            ) : (
              <span className="text-xs text-slate-500">NO TEAM TAGS</span>
            )}
          </div>
        )}
      </div>



      {/* ACTIVE FILTERS SUMMARY */}
      {hasActiveFilters && (
        <div className="mt-4 p-2 bg-slate-700 rounded-md">
          <div className="text-xs text-slate-300 mb-2">ACTIVE FILTERS:</div>
          <div className="space-y-1">
            {filters.account.map(tag => (
              <span key={`account-${tag}`} className={`inline-block text-xs px-2 py-1 rounded mr-1 mb-1 ${getTagColor('account')} text-white`}>
                ACCOUNT: {tag}
              </span>
            ))}
            {filters.team.map(tag => (
              <span key={`team-${tag}`} className={`inline-block text-xs px-2 py-1 rounded mr-1 mb-1 ${getTagColor('team')} text-white`}>
                TEAM: {tag}
              </span>
            ))}

          </div>
        </div>
      )}
    </div>
  );
}
