import { Routes, Route, useLocation } from "react-router-dom";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "./components/ui/navigation-menu";
import {
  HomeIcon,
  BarChart3Icon,
  DownloadIcon,
  GithubIcon,
} from "lucide-react";
import Vis from "./pages/Vis";
import Document from "./pages/Document";
import Download from "./pages/Download";
import { ThemeProvider } from "@/components/theme-provider";
import { ModeToggle } from "./components/mode-toggle";
import { Button } from "./components/ui/button";
import LandingPage from "./pages/LandingPage";
import myLogo from "./assets/logo_t_final.png";

export default function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <div className="h-screen flex flex-col">
        {/* Navigation Bar */}
        <nav className="bg-background border-b border-border px-2 sm:px-5 py-2 flex-shrink-0 shadow-sm">
          <div className="flex flex-row sm:flex-row sm:items-center gap-4">
            {/* A button with icon to link*/}
            <div className="flex items-center gap-3 flex-shrink-0">
              <a
                href="https://github.com/JianYang-Lab"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button
                  variant="outline"
                  size="icon"
                  className="justify-center"
                >
                  <GithubIcon className="h-4 w-4" />
                </Button>
              </a>
            </div>
          </div>
        </nav>

        {/* Main Content Area */}
        <div className="flex-1 overflow-auto">
          <Routes>
            <Route path="/" element={<Vis />} />
          </Routes>
        </div>
      </div>
    </ThemeProvider>
  );
}
