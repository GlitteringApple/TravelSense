package com.travelsense.TravelSense

import android.database.Cursor
import android.database.MatrixCursor
import android.os.CancellationSignal
import android.os.ParcelFileDescriptor
import android.provider.DocumentsContract
import android.provider.DocumentsProvider
import java.io.File
import java.io.FileNotFoundException

class TravelSenseDocumentsProvider : DocumentsProvider() {

    private val DEFAULT_ROOT_ID = "travelsense_root"
    private val DEFAULT_DOCUMENT_ID = "travelsense_root_doc"

    override fun onCreate(): Boolean {
        return true
    }

    override fun queryRoots(projection: Array<out String>?): Cursor {
        val result = MatrixCursor(projection ?: arrayOf(
            DocumentsContract.Root.COLUMN_ROOT_ID,
            DocumentsContract.Root.COLUMN_SUMMARY,
            DocumentsContract.Root.COLUMN_FLAGS,
            DocumentsContract.Root.COLUMN_TITLE,
            DocumentsContract.Root.COLUMN_DOCUMENT_ID,
            DocumentsContract.Root.COLUMN_ICON
        ))

        result.newRow().apply {
            add(DocumentsContract.Root.COLUMN_ROOT_ID, DEFAULT_ROOT_ID)
            add(DocumentsContract.Root.COLUMN_SUMMARY, "TravelSense App Data")
            add(DocumentsContract.Root.COLUMN_FLAGS, DocumentsContract.Root.FLAG_SUPPORTS_CREATE or DocumentsContract.Root.FLAG_SUPPORTS_IS_CHILD)
            add(DocumentsContract.Root.COLUMN_TITLE, "TravelSense")
            add(DocumentsContract.Root.COLUMN_DOCUMENT_ID, DEFAULT_DOCUMENT_ID)
            add(DocumentsContract.Root.COLUMN_ICON, R.mipmap.ic_launcher)
        }
        return result
    }

    override fun queryDocument(documentId: String?, projection: Array<out String>?): Cursor {
        val result = MatrixCursor(projection ?: arrayOf(
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_SIZE,
            DocumentsContract.Document.COLUMN_MIME_TYPE,
            DocumentsContract.Document.COLUMN_LAST_MODIFIED,
            DocumentsContract.Document.COLUMN_FLAGS
        ))

        val file = getFileForDocId(documentId ?: DEFAULT_DOCUMENT_ID)
        includeFile(result, documentId ?: DEFAULT_DOCUMENT_ID, file)
        return result
    }

    override fun queryChildDocuments(
        parentDocumentId: String?,
        projection: Array<out String>?,
        sortOrder: String?
    ): Cursor {
        val result = MatrixCursor(projection ?: arrayOf(
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_SIZE,
            DocumentsContract.Document.COLUMN_MIME_TYPE,
            DocumentsContract.Document.COLUMN_LAST_MODIFIED,
            DocumentsContract.Document.COLUMN_FLAGS
        ))

        val parent = getFileForDocId(parentDocumentId ?: DEFAULT_DOCUMENT_ID)
        parent.listFiles()?.forEach { file ->
            includeFile(result, null, file)
        }
        return result
    }

    override fun openDocument(
        documentId: String?,
        mode: String?,
        signal: CancellationSignal?
    ): ParcelFileDescriptor {
        val file = getFileForDocId(documentId ?: "")
        val accessMode = ParcelFileDescriptor.parseMode(mode)
        return ParcelFileDescriptor.open(file, accessMode)
    }

    private fun getFileForDocId(documentId: String): File {
        val baseDir = context?.filesDir ?: throw FileNotFoundException("Files dir not found")
        if (documentId == DEFAULT_DOCUMENT_ID) {
            return baseDir
        }
        val path = documentId.removePrefix("file_")
        val file = File(baseDir, path)
        return file
    }

    private fun includeFile(cursor: MatrixCursor, documentId: String?, file: File) {
        val docId = documentId ?: "file_${file.name}"
        cursor.newRow().apply {
            add(DocumentsContract.Document.COLUMN_DOCUMENT_ID, docId)
            add(DocumentsContract.Document.COLUMN_DISPLAY_NAME, file.name)
            add(DocumentsContract.Document.COLUMN_SIZE, file.length())
            add(DocumentsContract.Document.COLUMN_MIME_TYPE, if (file.isDirectory) DocumentsContract.Document.MIME_TYPE_DIR else "application/octet-stream")
            add(DocumentsContract.Document.COLUMN_LAST_MODIFIED, file.lastModified())
            add(DocumentsContract.Document.COLUMN_FLAGS, 0)
        }
    }
}
