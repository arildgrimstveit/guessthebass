/// <reference types="vite/client" />

export {}

declare global {
  interface FileSystemHandlePermissionDescriptor {
    mode?: 'read' | 'readwrite'
  }

  interface FileSystemHandle {
    queryPermission(
      descriptor?: FileSystemHandlePermissionDescriptor,
    ): Promise<PermissionState>
    requestPermission(
      descriptor?: FileSystemHandlePermissionDescriptor,
    ): Promise<PermissionState>
  }

  interface FileSystemDirectoryHandle {
    queryPermission(
      descriptor?: FileSystemHandlePermissionDescriptor,
    ): Promise<PermissionState>
    requestPermission(
      descriptor?: FileSystemHandlePermissionDescriptor,
    ): Promise<PermissionState>
    entries(): AsyncIterableIterator<[string, FileSystemHandle]>
    values(): AsyncIterableIterator<FileSystemHandle>
    keys(): AsyncIterableIterator<string>
    [Symbol.asyncIterator](): AsyncIterableIterator<[string, FileSystemHandle]>
  }

  interface Window {
    showDirectoryPicker(options?: {
      id?: string
      mode?: 'read' | 'readwrite'
      startIn?:
        | FileSystemHandle
        | 'desktop'
        | 'documents'
        | 'downloads'
        | 'music'
        | 'pictures'
        | 'videos'
    }): Promise<FileSystemDirectoryHandle>
  }

  namespace React {
    interface InputHTMLAttributes<T> {
      webkitdirectory?: boolean | string
    }
  }
}
