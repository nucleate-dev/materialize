"use client";

import React, { useState } from "react";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  CheckCircleIcon,
  ClockIcon,
  PlayIcon,
  DocumentIcon,
  FolderIcon,
  PlusIcon,
  TrashIcon,
  ArrowRightIcon,
} from "@heroicons/react/24/outline";

export interface PlannedOperation {
  id: string;
  type: "create" | "modify" | "delete" | "move";
  title: string;
  description: string;
  filePath: string;
  newFilePath?: string; // for move operations
  status: "pending" | "in_progress" | "completed" | "error";
  error?: string;
}

export interface PlanningViewProps {
  operations: PlannedOperation[];
  isExpanded: boolean;
  onToggleExpanded: () => void;
  onExecuteStep: (operationId: string) => Promise<void>;
  currentExecutingId: string | null;
}

const getOperationIcon = (type: PlannedOperation["type"]) => {
  switch (type) {
    case "create":
      return <PlusIcon className="w-4 h-4" />;
    case "modify":
      return <DocumentIcon className="w-4 h-4" />;
    case "delete":
      return <TrashIcon className="w-4 h-4" />;
    case "move":
      return <ArrowRightIcon className="w-4 h-4" />;
    default:
      return <DocumentIcon className="w-4 h-4" />;
  }
};

const getOperationColor = (type: PlannedOperation["type"]) => {
  switch (type) {
    case "create":
      return "from-green-500 to-emerald-600";
    case "modify":
      return "from-blue-500 to-blue-600";
    case "delete":
      return "from-red-500 to-red-600";
    case "move":
      return "from-purple-500 to-purple-600";
    default:
      return "from-gray-500 to-gray-600";
  }
};

const getStatusIcon = (status: PlannedOperation["status"], isExecuting: boolean) => {
  if (isExecuting) {
    return <div className="w-4 h-4 bg-blue-500 rounded-full animate-ping" />;
  }
  
  switch (status) {
    case "completed":
      return <CheckCircleIcon className="w-4 h-4 text-green-500" />;
    case "error":
      return <div className="w-4 h-4 bg-red-500 rounded-full" />;
    case "in_progress":
      return <div className="w-4 h-4 bg-blue-500 rounded-full animate-pulse" />;
    default:
      return <ClockIcon className="w-4 h-4 text-gray-400" />;
  }
};

const getFileIcon = (filePath: string) => {
  if (filePath.includes('/')) {
    return <FolderIcon className="w-3 h-3 text-gray-500" />;
  }
  return <DocumentIcon className="w-3 h-3 text-gray-500" />;
};

export default function PlanningView({
  operations,
  isExpanded,
  onToggleExpanded,
  onExecuteStep,
  currentExecutingId,
}: PlanningViewProps) {
  const [executingOperations, setExecutingOperations] = useState<Set<string>>(new Set());

  const completedCount = operations.filter(op => op.status === "completed").length;
  const totalCount = operations.length;
  const hasErrors = operations.some(op => op.status === "error");

  const handleExecuteOperation = async (operationId: string) => {
    setExecutingOperations(prev => new Set([...prev, operationId]));
    try {
      await onExecuteStep(operationId);
    } finally {
      setExecutingOperations(prev => {
        const newSet = new Set(prev);
        newSet.delete(operationId);
        return newSet;
      });
    }
  };

  if (operations.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 p-4 rounded-2xl bg-gradient-to-br from-indigo-50/80 to-purple-50/80 dark:from-indigo-900/20 dark:to-purple-900/20 border border-indigo-200/50 dark:border-indigo-700/30 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={onToggleExpanded}
          className="flex items-center gap-2 hover:bg-indigo-100/50 dark:hover:bg-indigo-800/30 px-2 py-1 rounded-lg transition-colors"
        >
          <div className="p-1.5 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-500 dark:from-indigo-600 dark:to-purple-600">
            <PlayIcon className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-indigo-800 dark:text-indigo-200 text-sm">
            Detailed View
          </span>
          {isExpanded ? (
            <ChevronDownIcon className="w-4 h-4 text-indigo-600 dark:text-indigo-300" />
          ) : (
            <ChevronRightIcon className="w-4 h-4 text-indigo-600 dark:text-indigo-300" />
          )}
        </button>

        {/* Progress Badge */}
        <div className="flex items-center gap-2">
          <div className={`px-3 py-1 rounded-full text-xs font-medium ${
            hasErrors 
              ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300"
              : completedCount === totalCount
              ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
              : "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300"
          }`}>
            {completedCount}/{totalCount} completed
          </div>
          {currentExecutingId && (
            <div className="px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium">
              Executing...
            </div>
          )}
        </div>
      </div>

      {/* Collapsed Preview */}
      {!isExpanded && (
        <div className="text-sm text-indigo-700 dark:text-indigo-300">
          {operations.length} operation{operations.length !== 1 ? 's' : ''} planned
          {completedCount > 0 && ` • ${completedCount} completed`}
          {hasErrors && ` • Errors detected`}
        </div>
      )}

      {/* Expanded Operations List */}
      {isExpanded && (
        <div className="space-y-3">
          {operations.map((operation, index) => {
            const isExecuting = executingOperations.has(operation.id) || currentExecutingId === operation.id;
            
            return (
              <div
                key={operation.id}
                className={`flex items-start gap-3 p-3 rounded-xl transition-all duration-300 ${
                  isExecuting
                    ? "bg-blue-100/50 dark:bg-blue-900/30 ring-2 ring-blue-300 dark:ring-blue-600"
                    : operation.status === "completed"
                    ? "bg-green-50/50 dark:bg-green-900/20"
                    : operation.status === "error"
                    ? "bg-red-50/50 dark:bg-red-900/20"
                    : "bg-white/50 dark:bg-slate-800/30 hover:bg-white/70 dark:hover:bg-slate-700/40"
                }`}
              >
                {/* Step Number & Status */}
                <div className="flex flex-col items-center gap-1 flex-shrink-0">
                  <div className={`w-8 h-8 rounded-full bg-gradient-to-r ${getOperationColor(operation.type)} flex items-center justify-center text-white text-sm font-bold`}>
                    {index + 1}
                  </div>
                  {getStatusIcon(operation.status, isExecuting)}
                </div>

                {/* Operation Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        {getOperationIcon(operation.type)}
                        <span className="font-medium text-slate-800 dark:text-slate-200 text-sm uppercase tracking-wide">
                          {operation.type}
                        </span>
                        <span className="text-slate-600 dark:text-slate-400 text-sm">
                          {operation.title}
                        </span>
                      </div>

                      <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed mb-2">
                        {operation.description}
                      </p>

                      {/* File Path(s) */}
                      <div className="flex items-center gap-2 text-xs">
                        {getFileIcon(operation.filePath)}
                        <code className="px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded text-slate-700 dark:text-slate-300">
                          {operation.filePath}
                        </code>
                        {operation.newFilePath && (
                          <>
                            <ArrowRightIcon className="w-3 h-3 text-gray-400" />
                            <code className="px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded text-slate-700 dark:text-slate-300">
                              {operation.newFilePath}
                            </code>
                          </>
                        )}
                      </div>

                      {/* Error Message */}
                      {operation.status === "error" && operation.error && (
                        <div className="mt-2 p-2 bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-700/50 rounded-lg">
                          <p className="text-xs text-red-700 dark:text-red-300">
                            Error: {operation.error}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Execute Button or Status */}
                    {operation.status === "pending" && !isExecuting && (
                      <button
                        onClick={() => handleExecuteOperation(operation.id)}
                        className="px-3 py-1 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white rounded-lg text-xs font-medium transition-all duration-200 hover:scale-105 shadow-sm"
                      >
                        Execute
                      </button>
                    )}
                    
                    {/* Success indicator with clearer message */}
                    {operation.status === "completed" && (
                      <div className="px-3 py-1 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg text-xs font-medium flex items-center gap-1.5">
                        <CheckCircleIcon className="w-3 h-3" />
                        {operation.type === "create" && `Created ${operation.filePath}`}
                        {operation.type === "modify" && `Updated ${operation.filePath}`}
                        {operation.type === "delete" && `Deleted ${operation.filePath}`}
                        {operation.type === "move" && `Moved to ${operation.newFilePath || operation.filePath}`}
                      </div>
                    )}
                    
                    {/* Executing indicator */}
                    {isExecuting && (
                      <div className="px-3 py-1 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-lg text-xs font-medium flex items-center gap-1.5">
                        <div className="w-3 h-3 bg-white rounded-full animate-pulse" />
                        Executing...
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}