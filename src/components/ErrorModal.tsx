type ErrorModalProps = {
  show: boolean;
  onClose: () => void;
  errorMessage: string;
};

export default function ErrorModal({
  show,
  onClose,
  errorMessage,
}: ErrorModalProps) {
  if (!show) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-smoke-light flex">
      <div className="relative p-8 bg-white w-full max-w-md m-auto flex-col flex rounded-lg border border-gray-500">
        <span className="absolute top-0 right-0 p-4">
          <button onClick={onClose}>&times;</button>
        </span>
        <div>
          <h2 className="mt-8 text-lg font-semibold text-gray-900">Error</h2>
          <p className="mt-1 text-sm text-gray-700">{errorMessage}</p>
          <div className="flex justify-end pt-4">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-700"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
