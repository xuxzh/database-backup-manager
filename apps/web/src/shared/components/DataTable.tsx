import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "./EmptyState";

export type DataTableRow = {
  key: string | number;
  cells: ReactNode[];
  rowState?: "selected";
  onClick?: () => void;
};

export function DataTable({
  title,
  description,
  action,
  emptyText,
  headers,
  rows,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  emptyText: string;
  headers: string[];
  rows: DataTableRow[];
}) {
  return (
    <Card className="data-table-card">
      {(title || description || action) && (
        <CardHeader className="data-table-header">
          <div className="min-w-0">
            {title && <CardTitle>{title}</CardTitle>}
            {description && <CardDescription>{description}</CardDescription>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </CardHeader>
      )}
      <CardContent className="data-table-content">
        {rows.length ? (
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-muted/45">
              <TableRow>
                {headers.map((header, headerIndex) => (
                  <TableHead className={headerIndex === headers.length - 1 ? "text-right" : undefined} key={header}>
                    {header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  className={row.onClick ? "cursor-pointer" : undefined}
                  key={row.key}
                  data-state={row.rowState}
                  onClick={row.onClick}
                >
                  {row.cells.map((cell, cellIndex) => (
                    <TableCell
                      key={cellIndex}
                      className={
                        cellIndex === row.cells.length - 1
                          ? "whitespace-nowrap text-right"
                          : "max-w-[320px] overflow-hidden text-ellipsis whitespace-nowrap"
                      }
                    >
                      {cell}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState text={emptyText} />
        )}
      </CardContent>
    </Card>
  );
}
