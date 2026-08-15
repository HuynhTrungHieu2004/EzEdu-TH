import React from 'react';
import type { SourceChunkResponse, WebCitation } from '../types/chat';

export const parseCitations = (
  text: string,
  internalCitations: SourceChunkResponse[],
  webCitations: WebCitation[],
  onCitationClick: (sourceId: string) => void
): React.ReactNode => {
  if (!text) return '';

  const regex = /(\[DOC_\d+\]|\[WEB_\d+\])/g;
  const parts = text.split(regex);

  const validSourceIds = new Set([
    ...internalCitations.map((c) => c.source_id),
    ...webCitations.map((c) => c.source_id),
  ].filter(Boolean) as string[]);

  return parts.map((part, index) => {
    if (part.startsWith('[DOC_') || part.startsWith('[WEB_')) {
      const sourceId = part.slice(1, -1);
      
      if (validSourceIds.has(sourceId)) {
        return (
          <a
            key={index}
            href={`#cite-${sourceId}`}
            onClick={(e) => {
              e.preventDefault();
              onCitationClick(sourceId);
            }}
            className="citation-link-tag"
            title={`Xem nguồn ${sourceId}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '2px 6px',
              margin: '0 2px',
              fontSize: '12px',
              fontWeight: '700',
              color: 'var(--ez-primary)',
              backgroundColor: 'var(--ez-primary-subtle)',
              border: '1px solid var(--ez-primary-border)',
              borderRadius: '6px',
              textDecoration: 'none',
              cursor: 'pointer',
              verticalAlign: 'middle',
            }}
          >
            {part}
          </a>
        );
      }
      return part;
    }
    return part;
  });
};

export const renderAnswerWithCitations = (
  text: string,
  internalCitations: SourceChunkResponse[],
  webCitations: WebCitation[],
  onCitationClick: (sourceId: string) => void
): React.ReactNode => {
  if (!text) return '';
  const lines = text.split('\n');
  return lines.map((line, idx) => (
    <React.Fragment key={idx}>
      {parseCitations(line, internalCitations, webCitations, onCitationClick)}
      {idx < lines.length - 1 && <br />}
    </React.Fragment>
  ));
};

export const formatConfidence = (val?: number | null): string => {
  if (val === undefined || val === null || isNaN(val)) {
    return 'Không xác định';
  }
  return `${Math.round(val * 100)}%`;
};
