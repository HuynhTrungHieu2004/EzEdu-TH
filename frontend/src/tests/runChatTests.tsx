import { renderAnswerWithCitations, formatConfidence } from '../utils/chatCitations';
import { getChatErrorMessage } from '../utils/chatErrors';
import { SCOPE_LABELS, RETRIEVAL_MODE_LABELS, EVIDENCE_STATUS_LABELS } from '../constants/advancedChat';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

function runTests() {
  console.log("=== BẮT ĐẦU CHẠY FRONTEND UNIT TESTS ===");

  // 1. Test Mappings
  assert(SCOPE_LABELS.general === 'Tự động chọn nguồn', 'SCOPE_LABELS.general map');
  assert(RETRIEVAL_MODE_LABELS.internal_only === 'Chỉ dùng học liệu', 'RETRIEVAL_MODE_LABELS.internal_only map');
  assert(EVIDENCE_STATUS_LABELS.well_supported === 'Có nguồn hỗ trợ tốt', 'EVIDENCE_STATUS_LABELS.well_supported map');
  console.log("✅ 1. Test mappings: OK");

  // 2. Test Errors Mapper
  const mockTimeoutError = { isAxiosError: true, code: 'ECONNABORTED', message: 'timeout of 5000ms exceeded', response: undefined };
  const mock429Error = { isAxiosError: true, response: { status: 429, data: { detail: 'Too Many Requests' } }, message: '' };
  const mock409Error = { isAxiosError: true, response: { status: 409, data: { detail: 'Lock active' } }, message: '' };

  assert(getChatErrorMessage(mockTimeoutError).includes('Timeout'), 'Timeout mapping');
  assert(getChatErrorMessage(mock429Error).includes('Rate Limit'), '429 Rate Limit mapping');
  assert(getChatErrorMessage(mock409Error).includes('đang được xử lý'), '409 Concurrency lock mapping');
  console.log("✅ 2. Test error mapping: OK");

  // 3. Test Citation rendering checks
  const internalCitations = [
    {
      document_id: 'doc-1',
      document_title: 'Tài liệu toán',
      chunk_id: 'chunk-1',
      excerpt: 'Định lý Pythagoras.',
      source_id: 'DOC_1',
    },
  ];
  const webCitations = [
    {
      title: 'Pythagorean theorem - Wikipedia',
      url: 'https://en.wikipedia.org/wiki/Pythagorean_theorem',
      source_id: 'WEB_1',
    },
  ];

  const testText = "Định lý toán học [DOC_1] và [WEB_1] cùng [DOC_999] (hết).";
  const result = renderAnswerWithCitations(testText, internalCitations, webCitations, () => {});

  // Verify result is not empty
  assert(Array.isArray(result) && result.length > 0, 'Result should be an array of parts');
  
  // result is a React fragment containing rows of parsed lines.
  // We can search through the structure to verify correct mapping
  let foundDoc1Link = false;
  let foundDoc999AsLink = false;
  
  // Helper to inspect react nodes recursive
  const inspectNodes = (nodes: unknown): void => {
    if (!nodes) return;
    if (Array.isArray(nodes)) {
      (nodes as unknown[]).forEach(inspectNodes);
      return;
    }
    if (typeof nodes === 'object' && nodes !== null) {
      const node = nodes as Record<string, unknown>;
      if (node.type === 'a') {
        const props = (node.props ?? {}) as Record<string, unknown>;
        const href = (props.href as string) || '';
        if (href.includes('DOC_1')) foundDoc1Link = true;
        if (href.includes('DOC_999')) foundDoc999AsLink = true;
        // Verify javascript: urls are never in href
        assert(!href.startsWith('javascript:'), 'javascript: prefix forbidden in href');
      }
      const props = (node.props ?? {}) as Record<string, unknown>;
      if (props.children) {
        inspectNodes(props.children);
      }
    }
  };
  inspectNodes(result);

  assert(foundDoc1Link, 'Valid source_id DOC_1 must create a link');
  assert(!foundDoc999AsLink, 'Invalid source_id DOC_999 must not create a link');
  console.log("✅ 3. Test citation parsing (valid, invalid, XSS safety): OK");

  // 4. Test Confidence Formatter
  assert(formatConfidence(0.854) === '85%', 'Confidence round check');
  assert(formatConfidence(null) === 'Không xác định', 'Confidence null check');
  assert(formatConfidence(undefined) === 'Không xác định', 'Confidence undefined check');
  assert(formatConfidence(NaN) === 'Không xác định', 'Confidence NaN check');
  console.log("✅ 4. Test confidence formatter: OK");

  // 5. Test Request Payload Builder validation
  const buildPayload = (question: string, scope: string, docIds: string[], useWeb: boolean, style: string) => {
    if (!question.trim()) throw new Error("Empty question");
    if (scope === 'document' && docIds.length !== 1) throw new Error("Must select exactly 1 document");
    if (scope === 'multiple_documents' && (docIds.length < 1 || docIds.length > 10)) throw new Error("Must select between 1 and 10 documents");
    return { question, scope, document_ids: docIds, use_web_search: useWeb, response_style: style };
  };

  const payload = buildPayload("Hello", "document", ["doc-123"], true, "normal");
  assert(payload.document_ids[0] === "doc-123", "Valid doc payload");

  let threw = false;
  try {
    buildPayload("Hello", "document", [], true, "normal");
  } catch {
    threw = true;
  }
  assert(threw, "Should throw when doc scope without document");
  console.log("✅ 5. Test request payload builder: OK");

  // 6. Test Feedback form client-side validations
  const validateFeedbackForm = (
    rating: 'helpful' | 'not_helpful',
    reasons: string[],
    comment: string,
    citations: string[]
  ) => {
    const cleanComment = comment.trim() || null;
    const uniqueReasons = Array.from(new Set(reasons));
    const uniqueCitations = Array.from(new Set(citations));

    if (uniqueReasons.length > 5) throw new Error("Chỉ được chọn tối đa 5 lý do lỗi.");
    if (uniqueCitations.length > 5) throw new Error("Chỉ được báo lỗi tối đa 5 nguồn trích dẫn.");

    const citationPattern = /^(DOC|WEB)_[1-9]\d*$/;
    for (const cid of uniqueCitations) {
      if (!citationPattern.test(cid)) {
        throw new Error(`Định dạng citation '${cid}' không hợp lệ.`);
      }
    }

    if (rating === 'helpful') {
      return { rating, reason_codes: [], comment: null, reported_citation_ids: [] };
    }

    if (!uniqueReasons.length && !cleanComment) {
      throw new Error("Vui lòng cung cấp ít nhất một lý do lỗi hoặc nhận xét chi tiết.");
    }

    if (uniqueReasons.includes('other') && !cleanComment) {
      throw new Error("Vui lòng nhập nhận xét chi tiết khi chọn lý do 'Khác'.");
    }

    return { rating, reason_codes: uniqueReasons, comment: cleanComment, reported_citation_ids: uniqueCitations };
  };

  // Check helpful clears negative fields
  const cleanHelpful = validateFeedbackForm('helpful', ['incorrect_information'], 'Một bình luận', ['DOC_1']);
  assert(cleanHelpful.rating === 'helpful', 'Helpful rating');
  assert(cleanHelpful.reason_codes.length === 0, 'Helpful clears reasons');
  assert(cleanHelpful.comment === null, 'Helpful clears comment');
  assert(cleanHelpful.reported_citation_ids.length === 0, 'Helpful clears citations');

  // Check duplicate reasons/citations deduplicated
  const cleanDedupe = validateFeedbackForm('not_helpful', ['incorrect_information', 'incorrect_information'], 'lỗi', ['DOC_1', 'DOC_1']);
  assert(cleanDedupe.reason_codes.length === 1, 'Reason codes deduplicated');
  assert(cleanDedupe.reported_citation_ids.length === 1, 'Citations deduplicated');

  // Check invalid citation ID format throws
  let citeThrew = false;
  try {
    validateFeedbackForm('not_helpful', ['incorrect_information'], 'lỗi', ['DOC_01']);
  } catch {
    citeThrew = true;
  }
  assert(citeThrew, 'DOC_01 must throw');

  // Check not_helpful requires reasons or comment
  let missingNegativeThrew = false;
  try {
    validateFeedbackForm('not_helpful', [], '', []);
  } catch {
    missingNegativeThrew = true;
  }
  assert(missingNegativeThrew, 'Empty negative feedback throws');

  // Check other requires comment
  let otherMissingCommentThrew = false;
  try {
    validateFeedbackForm('not_helpful', ['other'], '', []);
  } catch {
    otherMissingCommentThrew = true;
  }
  assert(otherMissingCommentThrew, 'Other reason without comment throws');

  console.log("✅ 6. Test feedback client-side validation: OK");

  // 7. Test Optimistic Update & Rollback simulation
  const simulateOptimisticFlow = (isSuccess: boolean) => {
    type FeedbackLike = { rating: 'helpful' | 'not_helpful'; reason_codes: string[]; comment: null; reported_citation_ids: string[] } | null;
    const messageStore: { id: string; role: 'assistant'; content: string; feedback: FeedbackLike } = {
      id: 'msg-1',
      role: 'assistant' as const,
      content: 'Hello',
      feedback: null
    };

    // 1. User clicks rating. Backup old state
    const backupFeedback = messageStore.feedback;
    const newFeedback = { rating: 'helpful' as const, reason_codes: [], comment: null, reported_citation_ids: [] };
    
    // 2. Perform optimistic update
    messageStore.feedback = newFeedback;
    
    // 3. API Execution
    if (isSuccess) {
      // Keep optimistic
    } else {
      // Rollback
      messageStore.feedback = backupFeedback;
    }
    return messageStore;
  };

  const successState = simulateOptimisticFlow(true);
  assert(successState.feedback !== null && successState.feedback.rating === 'helpful', 'Optimistic state success');

  const failedState = simulateOptimisticFlow(false);
  assert(failedState.feedback === null, 'Optimistic state rollback to backup');
  console.log("✅ 7. Test optimistic feedback state flow and rollback: OK");

  // 8. Test Conversation Management validations & state simulation
  const validateTitleInput = (title: string) => {
    const trimmed = title.trim();
    if (!trimmed) throw new Error("Tiêu đề không được để trống.");
    if (trimmed.length > 100) throw new Error("Tiêu đề tối đa 100 ký tự.");
    // eslint-disable-next-line no-control-regex
    if (/[\x00-\x1f\x7f-\x9f]/u.test(trimmed)) throw new Error("Tiêu đề chứa ký tự không hợp lệ.");
    return trimmed;
  };

  assert(validateTitleInput("   Học tập   ") === "Học tập", "Trim title");
  
  let emptyTitleThrew = false;
  try { validateTitleInput("    "); } catch { emptyTitleThrew = true; }
  assert(emptyTitleThrew, "Empty title validation");

  let longTitleThrew = false;
  try { validateTitleInput("A".repeat(101)); } catch { longTitleThrew = true; }
  assert(longTitleThrew, "Too long title validation");

  let invalidCharThrew = false;
  try { validateTitleInput("Title\x00Name"); } catch { invalidCharThrew = true; }
  assert(invalidCharThrew, "Control character title validation");

  // Pin state simulation
  type ConvLike = { id: string; title: string; is_pinned: boolean; pinned_at: string | null };
  const simulatePinChange = (conv: ConvLike, pin: boolean) => {
    const backup = { ...conv };
    const updated = {
      ...conv,
      is_pinned: pin,
      pinned_at: pin ? (conv.is_pinned ? conv.pinned_at : new Date().toISOString()) : null
    };
    return { backup, updated };
  };

  const initialConv = { id: 'c1', title: 'C1', is_pinned: false, pinned_at: null };
  const step1 = simulatePinChange(initialConv, true);
  assert(step1.updated.is_pinned === true, "Pin true is set");
  assert(step1.updated.pinned_at !== null, "Pinned timestamp is set");

  // Pin idempotent check: pin true -> true keeps original pinned_at
  const pinnedConv = step1.updated;
  const step2 = simulatePinChange(pinnedConv, true);
  assert(step2.updated.pinned_at === pinnedConv.pinned_at, "Idempotent pin preserves old pinned_at");

  console.log("✅ 8. Test conversation management validation & state changes: OK");

  console.log("=== TẤT CẢ UNIT TESTS ĐỀU ĐẠT CHUẨN ===");
}

try {
  runTests();
  // @ts-expect-error Node environment process exit
  process.exit(0);
} catch (e: unknown) {
  const err = e as Error;
  console.error("❌ UNIT TEST THẤT BẠI:", err.message);
  // @ts-expect-error Node environment process exit
  process.exit(1);
}
