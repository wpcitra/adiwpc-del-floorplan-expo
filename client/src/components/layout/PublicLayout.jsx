import React from 'react';
import { Outlet } from 'react-router-dom';

export default function PublicLayout() {
  return (
    <div className="w-full h-screen overflow-hidden bg-slate-100 flex flex-col">
      <Outlet />
    </div>
  );
}
