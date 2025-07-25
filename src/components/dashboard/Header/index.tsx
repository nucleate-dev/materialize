import Link from "next/link";
import DropdownUser from "./DropdownUser";
import Image from "next/image";
import { useSidebar } from "@/hooks/useSidebar";
import { 
  MagnifyingGlassIcon,
  Bars3Icon 
} from "@heroicons/react/24/outline";

const Header = () => {
  const { sidebarOpen, setSidebarOpen } = useSidebar();
  
  return (
    <header className="sticky top-0 z-999 w-full relative">
      {/* Enhanced Glassmorphism Background with Gradient */}
      <div className="absolute inset-0 bg-gradient-to-r from-white/90 via-gray-2/85 to-whiter/90 dark:from-boxdark/90 dark:via-boxdark-2/85 dark:to-meta-4/90 backdrop-blur-xl"></div>
      
      {/* Multi-layered Border System */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-stroke/60 to-transparent dark:via-strokedark/60"></div>
      <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-primary/20 via-secondary/30 to-meta-5/20 dark:from-primary/30 dark:via-secondary/40 dark:to-meta-5/30 blur-sm"></div>
      
      {/* Enhanced Shadow */}
      <div className="absolute -bottom-6 left-0 right-0 h-6 bg-gradient-to-b from-black/5 to-transparent dark:from-black/12 dark:to-transparent pointer-events-none"></div>

      {/* Animated Background Orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-10 -right-20 w-32 h-32 bg-gradient-to-br from-primary/8 to-secondary/8 dark:from-primary/15 dark:to-secondary/15 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -top-10 -left-20 w-24 h-24 bg-gradient-to-tr from-meta-5/8 to-meta-3/8 dark:from-meta-5/15 dark:to-meta-3/15 rounded-full blur-2xl animate-pulse delay-1000"></div>
        <div 
          className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-16 h-16 bg-gradient-to-r from-primary/3 via-secondary/3 to-meta-5/3 dark:from-primary/8 dark:via-secondary/8 dark:to-meta-5/8 rounded-full blur-2xl animate-spin"
          style={{ animationDuration: '20s' }}
        ></div>
      </div>

      {/* Header Content */}
      <div className="relative z-10 flex flex-grow items-center justify-between px-6 py-4 md:px-8 2xl:px-12">
        {/* Left Section - Mobile Menu & Logo */}
        <div className="flex items-center gap-4 lg:hidden">
          {/* Modern Mobile Toggle Button */}
          <button
            aria-controls="sidebar"
            onClick={(e) => {
              e.stopPropagation();
              setSidebarOpen(!sidebarOpen);
            }}
            className="flex items-center justify-center w-10 h-10 rounded-xl bg-white/60 dark:bg-boxdark/60 hover:bg-white/80 dark:hover:bg-boxdark/80 border border-stroke/30 dark:border-strokedark/40 backdrop-blur-sm transition-all duration-300 hover:scale-110 group"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-secondary/10 dark:from-primary/20 dark:to-secondary/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <Bars3Icon className="relative w-5 h-5 text-body dark:text-bodydark transition-colors duration-300 group-hover:text-primary dark:group-hover:text-secondary" />
          </button>

          {/* Mobile Logo */}
          <Link href="/dashboard" className="group">
            <div className="relative p-2 bg-gradient-to-br from-primary/10 to-secondary/10 dark:from-primary/20 dark:to-secondary/20 rounded-xl border border-white/20 dark:border-strokedark/30 backdrop-blur-sm group-hover:scale-110 transition-transform duration-300">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-secondary/20 dark:from-primary/30 dark:to-secondary/30 rounded-xl blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              <Image
                width={24}
                height={24}
                src="/images/logo/logo-icon.svg"
                alt="Logo"
                className="relative w-6 h-6"
              />
            </div>
          </Link>
        </div>

        {/* Center Section - Search Bar */}
        <div className="hidden sm:block flex-1 max-w-2xl mx-6">
          <form className="relative group">
            {/* Enhanced Search Container */}
            <div className="relative overflow-hidden rounded-2xl">
              {/* Animated border gradient */}
              <div className="absolute inset-0 bg-gradient-to-r from-primary/20 via-secondary/20 to-meta-5/20 dark:from-primary/30 dark:via-secondary/30 dark:to-meta-5/30 rounded-2xl opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-500 blur-sm"></div>
              <div className="absolute inset-[1px] bg-white/80 dark:bg-boxdark/80 rounded-2xl backdrop-blur-sm"></div>
              
              {/* Search Icon */}
              <button 
                type="submit"
                className="absolute left-4 top-1/2 -translate-y-1/2 z-10 p-1 rounded-lg transition-all duration-300 hover:scale-110 group/icon"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-secondary/20 dark:from-primary/30 dark:to-secondary/30 rounded-lg opacity-0 group-hover/icon:opacity-100 transition-opacity duration-300"></div>
                <MagnifyingGlassIcon className="relative w-5 h-5 text-body/60 dark:text-bodydark/60 group-hover/icon:text-primary dark:group-hover/icon:text-secondary transition-colors duration-300" />
              </button>

              {/* Search Input */}
              <input
                type="text"
                placeholder="Search projects, whiteboards... ✨"
                className="relative w-full pl-14 pr-6 py-4 text-base font-medium bg-transparent text-black dark:text-white placeholder-body/50 dark:placeholder-bodydark/50 border-0 focus:outline-none focus:ring-0 transition-all duration-300"
              />

              {/* Search Enhancement Indicator */}
              <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 text-xs text-body/40 dark:text-bodydark/40">
                <div className="hidden md:flex items-center gap-1 px-2 py-1 bg-stroke/20 dark:bg-strokedark/30 rounded-md">
                  <span>⌘</span>
                  <span>K</span>
                </div>
              </div>
            </div>
          </form>
        </div>

        {/* Right Section - User */}
        <div className="flex items-center gap-3 2xsm:gap-6">

          {/* User Dropdown */}
          <div className="relative group">
            {/* Enhanced background glow */}
            <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-secondary/10 dark:from-primary/20 dark:to-secondary/20 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-lg"></div>
            <div className="relative p-1 bg-white/40 dark:bg-boxdark/40 rounded-2xl border border-stroke/30 dark:border-strokedark/40 backdrop-blur-sm group-hover:bg-white/60 dark:group-hover:bg-boxdark/60 transition-all duration-300">
              <DropdownUser />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;