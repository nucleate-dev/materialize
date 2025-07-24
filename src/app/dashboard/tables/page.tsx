import Breadcrumb from "@/components/dashboard/Breadcrumbs/Breadcrumb";
import TableOne from "@/components/dashboard/Tables/TableOne";
import TableThree from "@/components/dashboard/Tables/TableThree";
import TableTwo from "@/components/dashboard/Tables/TableTwo";

import { Metadata } from "next";
export const metadata: Metadata = {
  title: "Tables Page | Next.js E-commerce Dashboard Template",
  description: "This is Tables page for TailAdmin Next.js",
  // other metadata
};

const TablesPage = () => {
  return (
    <>
      <Breadcrumb pageName="Tables" />

      <div className="flex flex-col gap-10">
        <TableOne />
        <TableTwo />
        <TableThree />
      </div>
    </>
  );
};

export default TablesPage;
