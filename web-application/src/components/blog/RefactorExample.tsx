import React from "react";

const MobileMockup = ({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) => (
  <div className="relative mx-auto border-[#1A1D21] bg-[#1A1D21] border-[14px] rounded-[2.5rem] h-[600px] w-[300px] shadow-2xl flex flex-col ring-1 ring-white/5">
    <div className="h-[32px] w-[3px] bg-[#1A1D21] absolute -start-[17px] top-[72px] rounded-s-lg"></div>
    <div className="h-[46px] w-[3px] bg-[#1A1D21] absolute -start-[17px] top-[124px] rounded-s-lg"></div>
    <div className="h-[64px] w-[3px] bg-[#1A1D21] absolute -end-[17px] top-[142px] rounded-e-lg"></div>
    <div className="rounded-[2rem] overflow-hidden w-full h-full bg-[#0B0C0E] flex flex-col relative text-white">
      {/* Status Bar Mock */}
      <div className="h-8 bg-[#0B0C0E] w-full shrink-0 flex items-center justify-between px-6">
        <div className="w-10 h-3 bg-white/10 rounded-full"></div>
        <div className="flex gap-1.5">
          <div className="w-3 h-3 bg-white/10 rounded-full"></div>
          <div className="w-3 h-3 bg-white/10 rounded-full"></div>
        </div>
      </div>

      {/* App Header Mock */}
      <div className="h-12 border-b border-white/5 flex items-center px-4 shrink-0 bg-[#0B0C0E] z-10">
        <span className="text-sm font-semibold text-white tracking-wide">
          {title}
        </span>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-4 bg-[#0B0C0E]">{children}</div>

      {/* Home Indicator */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-32 h-1 bg-white/10 rounded-full"></div>
    </div>
  </div>
);

export const UserCardBad = () => (
  <div
    style={{
      border: "1px solid white",
      padding: "10px",
      backgroundColor: "black",
      color: "white",
    }}
  >
    <div
      style={{
        borderBottom: "1px solid white",
        paddingBottom: "5px",
        marginBottom: "10px",
      }}
    >
      <span style={{ fontSize: "20px", fontWeight: "bold" }}>Jane Doe</span>
      <span style={{ float: "right", color: "lightgray" }}>Admin</span>
    </div>
    <p style={{ marginTop: "5px" }}>jane@example.com</p>
    <button
      style={{
        backgroundColor: "blue",
        color: "white",
        width: "100%",
        marginTop: "10px",
        padding: "2px 6px",
      }}
    >
      Edit Profile
    </button>
  </div>
);

export const UserCardGood = () => (
  <div className="bg-[#141517] rounded-lg shadow-lg border border-white/5 p-4 w-full">
    <div className="flex justify-between items-start mb-4">
      <div>
        <h3 className="text-base font-semibold text-white m-0 leading-tight">
          Jane Doe
        </h3>
        <p className="text-xs text-[#8A8F98] m-0 mt-1">jane@example.com</p>
      </div>
      <span className="bg-white/5 text-xs text-[#8A8F98] px-2 py-1 rounded-md font-medium border border-white/5">
        Admin
      </span>
    </div>
    <button className="w-full mt-2 px-3 py-2 bg-white text-black border border-transparent text-sm font-medium rounded-md hover:bg-gray-200 transition-colors cursor-pointer active:scale-95">
      Edit Profile
    </button>
  </div>
);

export const RefactorComparison = () => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-12 my-12 items-start justify-center">
    <div className="flex flex-col items-center gap-6">
      <h4 className="text-sm font-bold text-red-400 uppercase tracking-widest text-center">
        Before
      </h4>
      <MobileMockup title="My App">
        <div className="space-y-4">
          <p className="text-xs text-white font-sans mb-4">
            Please view user profile below:
          </p>
          <UserCardBad />
        </div>
      </MobileMockup>
    </div>
    <div className="flex flex-col items-center gap-6">
      <h4 className="text-sm font-bold text-emerald-400 uppercase tracking-widest text-center">
        After
      </h4>
      <MobileMockup title="Team">
        <div className="space-y-4">
          <p className="text-xs text-[#8A8F98] font-medium mb-4 uppercase tracking-wider">
            Profile Details
          </p>
          <UserCardGood />
        </div>
      </MobileMockup>
    </div>
  </div>
);
