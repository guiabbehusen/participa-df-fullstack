import { createBrowserRouter } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { HomePage } from '@/features/home/HomePage'
import { NewManifestationPage } from '@/features/manifestation/NewManifestationPage'
import { ProtocolPage } from '@/features/protocol/ProtocolPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'manifestacoes/nova', element: <NewManifestationPage /> },
      { path: 'protocolos/:protocol', element: <ProtocolPage /> },
    ],
  },
])
