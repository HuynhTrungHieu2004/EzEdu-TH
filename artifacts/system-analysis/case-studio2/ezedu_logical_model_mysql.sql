-- EzEdu AI logical relational model for CASE Studio 2 reverse engineering.
-- Target dialect: conservative MySQL/InnoDB DDL.
-- IMPORTANT: The running application uses MongoDB and ChromaDB. This script is
-- a logical projection for analysis; it is not a production migration.

CREATE TABLE users (
  id VARCHAR(24) NOT NULL,
  email VARCHAR(320) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(200) NOT NULL,
  role VARCHAR(32) NOT NULL,
  status VARCHAR(16) NOT NULL,
  is_active BOOLEAN NOT NULL,
  student_profile_completed BOOLEAN NOT NULL,
  permissions_override_text TEXT,
  current_quota_text TEXT,
  force_logout_at DATETIME,
  last_login_at DATETIME,
  deleted_at DATETIME,
  created_at DATETIME NOT NULL,
  updated_at DATETIME,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY ix_users_role_status (role, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE classes (
  id VARCHAR(24) NOT NULL,
  owner_id VARCHAR(24) NOT NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  deleted_at DATETIME,
  created_at DATETIME NOT NULL,
  updated_at DATETIME,
  PRIMARY KEY (id),
  KEY ix_classes_owner (owner_id, deleted_at),
  CONSTRAINT fk_classes_owner FOREIGN KEY (owner_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE class_students (
  class_id VARCHAR(24) NOT NULL,
  student_id VARCHAR(24) NOT NULL,
  joined_at DATETIME,
  PRIMARY KEY (class_id, student_id),
  KEY ix_class_students_student (student_id),
  CONSTRAINT fk_class_students_class FOREIGN KEY (class_id) REFERENCES classes (id),
  CONSTRAINT fk_class_students_user FOREIGN KEY (student_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE documents (
  id VARCHAR(24) NOT NULL,
  user_id VARCHAR(24) NOT NULL,
  original_filename VARCHAR(500) NOT NULL,
  file_type VARCHAR(20) NOT NULL,
  media_kind VARCHAR(20) NOT NULL,
  file_size BIGINT NOT NULL,
  checksum VARCHAR(64),
  cloudinary_url TEXT,
  cloudinary_public_id VARCHAR(500),
  cloudinary_resource_type VARCHAR(32),
  status VARCHAR(32) NOT NULL,
  error_message TEXT,
  reuse_count INT NOT NULL,
  version INT NOT NULL,
  quarantined_at DATETIME,
  deleted_at DATETIME,
  created_by VARCHAR(24),
  updated_by VARCHAR(24),
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY ix_documents_owner_time (user_id, created_at),
  KEY ix_documents_status (status, created_at),
  UNIQUE KEY uq_documents_user_checksum_active (user_id, checksum, deleted_at),
  CONSTRAINT fk_documents_owner FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE document_contents (
  id VARCHAR(24) NOT NULL,
  document_id VARCHAR(24) NOT NULL,
  user_id VARCHAR(24) NOT NULL,
  extracted_text LONGTEXT NOT NULL,
  text_length INT NOT NULL,
  content_revision_hash VARCHAR(64),
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_document_contents_document (document_id),
  CONSTRAINT fk_document_contents_document FOREIGN KEY (document_id) REFERENCES documents (id),
  CONSTRAINT fk_document_contents_owner FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE document_chunks (
  id VARCHAR(80) NOT NULL,
  document_id VARCHAR(24) NOT NULL,
  user_id VARCHAR(24) NOT NULL,
  chunk_index INT NOT NULL,
  chunk_text LONGTEXT NOT NULL,
  embedding_source VARCHAR(40),
  embedding_dimension INT,
  page_number INT,
  heading VARCHAR(500),
  metadata_text TEXT,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_document_chunk_index (document_id, chunk_index),
  KEY ix_document_chunks_owner (user_id, document_id),
  CONSTRAINT fk_document_chunks_document FOREIGN KEY (document_id) REFERENCES documents (id),
  CONSTRAINT fk_document_chunks_owner FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE verification_sessions (
  id VARCHAR(24) NOT NULL,
  document_id VARCHAR(24) NOT NULL,
  user_id VARCHAR(24) NOT NULL,
  status VARCHAR(20) NOT NULL,
  content_revision_hash VARCHAR(64) NOT NULL,
  total_chunks INT NOT NULL,
  total_chunks_processed INT NOT NULL,
  total_issues_found INT NOT NULL,
  issues_accepted INT NOT NULL,
  issues_rejected INT NOT NULL,
  issues_pending INT NOT NULL,
  successful_chunks INT NOT NULL,
  failed_chunks INT NOT NULL,
  ai_model VARCHAR(120),
  summary_text TEXT,
  severity_stats_text TEXT,
  error_message TEXT,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  completed_at DATETIME,
  PRIMARY KEY (id),
  KEY ix_verification_sessions_document (document_id, created_at),
  KEY ix_verification_sessions_status (status, created_at),
  CONSTRAINT fk_verification_sessions_document FOREIGN KEY (document_id) REFERENCES documents (id),
  CONSTRAINT fk_verification_sessions_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE verification_issues (
  id VARCHAR(24) NOT NULL,
  session_id VARCHAR(24) NOT NULL,
  document_id VARCHAR(24) NOT NULL,
  user_id VARCHAR(24) NOT NULL,
  chunk_index INT NOT NULL,
  issue_type VARCHAR(40) NOT NULL,
  severity VARCHAR(20) NOT NULL,
  original_text LONGTEXT NOT NULL,
  suggested_fix LONGTEXT NOT NULL,
  reason TEXT NOT NULL,
  confidence DECIMAL(6,5),
  source_reference TEXT,
  external_verified BOOLEAN NOT NULL,
  ai_provider VARCHAR(40) NOT NULL,
  resolution VARCHAR(20) NOT NULL,
  user_edited_text LONGTEXT,
  resolved_at DATETIME,
  applied_at DATETIME,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY ix_verification_issues_session (session_id, chunk_index),
  CONSTRAINT fk_verification_issues_session FOREIGN KEY (session_id) REFERENCES verification_sessions (id),
  CONSTRAINT fk_verification_issues_document FOREIGN KEY (document_id) REFERENCES documents (id),
  CONSTRAINT fk_verification_issues_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE question_sets (
  id VARCHAR(24) NOT NULL,
  document_id VARCHAR(24) NOT NULL,
  user_id VARCHAR(24) NOT NULL,
  document_name VARCHAR(500) NOT NULL,
  question_count INT NOT NULL,
  difficulty VARCHAR(20) NOT NULL,
  question_type VARCHAR(30) NOT NULL,
  validation_stats_text TEXT,
  keywords_text TEXT,
  bloom_distribution_text TEXT,
  workflow_counts_text TEXT,
  published_question_count INT NOT NULL,
  audience_type VARCHAR(20) NOT NULL,
  deleted_at DATETIME,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY ix_question_sets_owner_time (user_id, deleted_at, created_at),
  KEY ix_question_sets_document (document_id, user_id),
  CONSTRAINT fk_question_sets_document FOREIGN KEY (document_id) REFERENCES documents (id),
  CONSTRAINT fk_question_sets_owner FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE question_set_items (
  question_set_id VARCHAR(24) NOT NULL,
  question_index INT NOT NULL,
  question_text LONGTEXT NOT NULL,
  options_text TEXT,
  correct_answer TEXT NOT NULL,
  explanation LONGTEXT NOT NULL,
  difficulty VARCHAR(20) NOT NULL,
  question_type VARCHAR(30) NOT NULL,
  bloom_level VARCHAR(20),
  tags_text TEXT,
  workflow_status VARCHAR(20) NOT NULL,
  reviewed_by VARCHAR(24),
  reviewed_at DATETIME,
  published_at DATETIME,
  deleted_at DATETIME,
  PRIMARY KEY (question_set_id, question_index),
  CONSTRAINT fk_question_set_items_set FOREIGN KEY (question_set_id) REFERENCES question_sets (id),
  CONSTRAINT fk_question_set_items_reviewer FOREIGN KEY (reviewed_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE question_set_target_classes (
  question_set_id VARCHAR(24) NOT NULL,
  class_id VARCHAR(24) NOT NULL,
  PRIMARY KEY (question_set_id, class_id),
  CONSTRAINT fk_qs_target_set FOREIGN KEY (question_set_id) REFERENCES question_sets (id),
  CONSTRAINT fk_qs_target_class FOREIGN KEY (class_id) REFERENCES classes (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE question_attempts (
  id VARCHAR(24) NOT NULL,
  question_set_id VARCHAR(24) NOT NULL,
  document_id VARCHAR(24) NOT NULL,
  user_id VARCHAR(24) NOT NULL,
  score INT NOT NULL,
  max_score INT NOT NULL,
  percent DECIMAL(7,3) NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY ix_question_attempts_user (user_id, created_at),
  CONSTRAINT fk_question_attempts_set FOREIGN KEY (question_set_id) REFERENCES question_sets (id),
  CONSTRAINT fk_question_attempts_document FOREIGN KEY (document_id) REFERENCES documents (id),
  CONSTRAINT fk_question_attempts_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE question_attempt_answers (
  attempt_id VARCHAR(24) NOT NULL,
  question_index INT NOT NULL,
  submitted_answer LONGTEXT,
  correct_answer LONGTEXT NOT NULL,
  is_correct BOOLEAN NOT NULL,
  PRIMARY KEY (attempt_id, question_index),
  CONSTRAINT fk_question_attempt_answers_attempt FOREIGN KEY (attempt_id) REFERENCES question_attempts (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE curriculum_taxonomy (
  id VARCHAR(24) NOT NULL,
  node_type VARCHAR(30) NOT NULL,
  name VARCHAR(200) NOT NULL,
  parent_id VARCHAR(24),
  grade INT,
  curriculum_version VARCHAR(80),
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY ix_taxonomy_type_parent (node_type, parent_id),
  CONSTRAINT fk_taxonomy_parent FOREIGN KEY (parent_id) REFERENCES curriculum_taxonomy (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE question_bank (
  id VARCHAR(24) NOT NULL,
  subject_id VARCHAR(24) NOT NULL,
  grade INT NOT NULL,
  curriculum_version VARCHAR(80) NOT NULL,
  chapter_id VARCHAR(24),
  topic_id VARCHAR(24),
  learning_outcome_id VARCHAR(24),
  bloom_level VARCHAR(20) NOT NULL,
  difficulty VARCHAR(20) NOT NULL,
  question_type VARCHAR(30) NOT NULL,
  content LONGTEXT NOT NULL,
  options_text TEXT,
  correct_answer LONGTEXT NOT NULL,
  explanation LONGTEXT NOT NULL,
  points DECIMAL(10,3) NOT NULL,
  expected_time_seconds INT NOT NULL,
  source_document_id VARCHAR(24),
  source_chunk_ids_text TEXT,
  citation TEXT,
  quality_status VARCHAR(20) NOT NULL,
  origin_question_set_id VARCHAR(24),
  origin_question_index INT,
  tags_text TEXT,
  usage_count INT NOT NULL,
  last_used_at DATETIME,
  status VARCHAR(20) NOT NULL,
  version INT NOT NULL,
  owner_id VARCHAR(24) NOT NULL,
  created_by VARCHAR(24) NOT NULL,
  updated_by VARCHAR(24) NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  deleted_at DATETIME,
  PRIMARY KEY (id),
  KEY ix_question_bank_owner_status (owner_id, status),
  KEY ix_question_bank_taxonomy (subject_id, grade, topic_id),
  CONSTRAINT fk_question_bank_subject FOREIGN KEY (subject_id) REFERENCES curriculum_taxonomy (id),
  CONSTRAINT fk_question_bank_chapter FOREIGN KEY (chapter_id) REFERENCES curriculum_taxonomy (id),
  CONSTRAINT fk_question_bank_topic FOREIGN KEY (topic_id) REFERENCES curriculum_taxonomy (id),
  CONSTRAINT fk_question_bank_outcome FOREIGN KEY (learning_outcome_id) REFERENCES curriculum_taxonomy (id),
  CONSTRAINT fk_question_bank_document FOREIGN KEY (source_document_id) REFERENCES documents (id),
  CONSTRAINT fk_question_bank_owner FOREIGN KEY (owner_id) REFERENCES users (id),
  CONSTRAINT fk_question_bank_origin_set FOREIGN KEY (origin_question_set_id) REFERENCES question_sets (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE exam_blueprints (
  id VARCHAR(24) NOT NULL,
  name VARCHAR(200) NOT NULL,
  subject_id VARCHAR(24) NOT NULL,
  grade INT NOT NULL,
  curriculum_version VARCHAR(80) NOT NULL,
  total_points DECIMAL(10,3) NOT NULL,
  duration_minutes INT NOT NULL,
  max_time_seconds INT,
  exclude_recently_used_days INT,
  status VARCHAR(20) NOT NULL,
  version INT NOT NULL,
  owner_id VARCHAR(24) NOT NULL,
  created_by VARCHAR(24) NOT NULL,
  updated_by VARCHAR(24) NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  deleted_at DATETIME,
  PRIMARY KEY (id),
  KEY ix_blueprints_owner_status (owner_id, status),
  CONSTRAINT fk_blueprints_subject FOREIGN KEY (subject_id) REFERENCES curriculum_taxonomy (id),
  CONSTRAINT fk_blueprints_owner FOREIGN KEY (owner_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE blueprint_constraints (
  id VARCHAR(24) NOT NULL,
  blueprint_id VARCHAR(24) NOT NULL,
  group_type VARCHAR(30) NOT NULL,
  group_key VARCHAR(80),
  question_count INT,
  points DECIMAL(10,3),
  PRIMARY KEY (id),
  KEY ix_blueprint_constraints_blueprint (blueprint_id, group_type),
  CONSTRAINT fk_blueprint_constraints_blueprint FOREIGN KEY (blueprint_id) REFERENCES exam_blueprints (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE exams (
  id VARCHAR(24) NOT NULL,
  blueprint_id VARCHAR(24) NOT NULL,
  blueprint_version INT NOT NULL,
  code VARCHAR(80) NOT NULL,
  equivalent_group_id VARCHAR(80) NOT NULL,
  question_order_seed BIGINT,
  total_points DECIMAL(10,3) NOT NULL,
  duration_minutes INT NOT NULL,
  status VARCHAR(20) NOT NULL,
  published_at DATETIME,
  audience_type VARCHAR(20) NOT NULL,
  version INT NOT NULL,
  owner_id VARCHAR(24) NOT NULL,
  created_by VARCHAR(24) NOT NULL,
  updated_by VARCHAR(24) NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  deleted_at DATETIME,
  PRIMARY KEY (id),
  KEY ix_exams_blueprint (blueprint_id),
  KEY ix_exams_equivalent (equivalent_group_id),
  KEY ix_exams_owner_status (owner_id, status, updated_at),
  CONSTRAINT fk_exams_blueprint FOREIGN KEY (blueprint_id) REFERENCES exam_blueprints (id),
  CONSTRAINT fk_exams_owner FOREIGN KEY (owner_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE exam_questions (
  exam_id VARCHAR(24) NOT NULL,
  question_id VARCHAR(24) NOT NULL,
  question_order INT NOT NULL,
  option_order_text TEXT,
  PRIMARY KEY (exam_id, question_id),
  UNIQUE KEY uq_exam_questions_order (exam_id, question_order),
  CONSTRAINT fk_exam_questions_exam FOREIGN KEY (exam_id) REFERENCES exams (id),
  CONSTRAINT fk_exam_questions_question FOREIGN KEY (question_id) REFERENCES question_bank (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE exam_target_classes (
  exam_id VARCHAR(24) NOT NULL,
  class_id VARCHAR(24) NOT NULL,
  PRIMARY KEY (exam_id, class_id),
  CONSTRAINT fk_exam_target_exam FOREIGN KEY (exam_id) REFERENCES exams (id),
  CONSTRAINT fk_exam_target_class FOREIGN KEY (class_id) REFERENCES classes (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE exam_attempts (
  id VARCHAR(24) NOT NULL,
  exam_id VARCHAR(24) NOT NULL,
  student_id VARCHAR(24) NOT NULL,
  exam_code VARCHAR(80) NOT NULL,
  status VARCHAR(20) NOT NULL,
  answers_text LONGTEXT,
  started_at DATETIME NOT NULL,
  due_at DATETIME NOT NULL,
  submitted_at DATETIME,
  auto_submitted BOOLEAN NOT NULL,
  total_score DECIMAL(10,3) NOT NULL,
  max_score DECIMAL(10,3) NOT NULL,
  version INT NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_exam_attempt_exam_student (exam_id, student_id),
  KEY ix_exam_attempt_status_due (status, due_at),
  CONSTRAINT fk_exam_attempt_exam FOREIGN KEY (exam_id) REFERENCES exams (id),
  CONSTRAINT fk_exam_attempt_student FOREIGN KEY (student_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE exam_attempt_results (
  attempt_id VARCHAR(24) NOT NULL,
  question_id VARCHAR(24) NOT NULL,
  question_type VARCHAR(30) NOT NULL,
  points_possible DECIMAL(10,3) NOT NULL,
  student_answer LONGTEXT,
  is_correct BOOLEAN,
  ai_score DECIMAL(10,3),
  ai_confidence DECIMAL(6,5),
  ai_feedback LONGTEXT,
  teacher_score DECIMAL(10,3),
  teacher_feedback LONGTEXT,
  final_score DECIMAL(10,3) NOT NULL,
  PRIMARY KEY (attempt_id, question_id),
  CONSTRAINT fk_attempt_results_attempt FOREIGN KEY (attempt_id) REFERENCES exam_attempts (id),
  CONSTRAINT fk_attempt_results_question FOREIGN KEY (question_id) REFERENCES question_bank (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE conversations (
  id VARCHAR(24) NOT NULL,
  user_id VARCHAR(24) NOT NULL,
  title VARCHAR(100) NOT NULL,
  normalized_title VARCHAR(100),
  scope VARCHAR(30) NOT NULL,
  is_pinned BOOLEAN NOT NULL,
  pinned_at DATETIME,
  deleted_at DATETIME,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY ix_conversations_user_time (user_id, deleted_at, updated_at),
  CONSTRAINT fk_conversations_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE conversation_documents (
  conversation_id VARCHAR(24) NOT NULL,
  document_id VARCHAR(24) NOT NULL,
  PRIMARY KEY (conversation_id, document_id),
  CONSTRAINT fk_conversation_documents_conversation FOREIGN KEY (conversation_id) REFERENCES conversations (id),
  CONSTRAINT fk_conversation_documents_document FOREIGN KEY (document_id) REFERENCES documents (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE conversation_messages (
  id VARCHAR(24) NOT NULL,
  conversation_id VARCHAR(24) NOT NULL,
  user_id VARCHAR(24) NOT NULL,
  request_id VARCHAR(160),
  role VARCHAR(20) NOT NULL,
  content LONGTEXT NOT NULL,
  retrieval_mode VARCHAR(40),
  evidence_status VARCHAR(40),
  confidence DECIMAL(6,5),
  internal_citations_text LONGTEXT,
  web_citations_text LONGTEXT,
  status VARCHAR(20) NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_message_request_role (request_id, role),
  KEY ix_messages_conversation_time (conversation_id, created_at),
  CONSTRAINT fk_messages_conversation FOREIGN KEY (conversation_id) REFERENCES conversations (id),
  CONSTRAINT fk_messages_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE ai_answer_feedback (
  id VARCHAR(24) NOT NULL,
  user_id VARCHAR(24) NOT NULL,
  conversation_id VARCHAR(24) NOT NULL,
  message_id VARCHAR(24) NOT NULL,
  rating VARCHAR(20) NOT NULL,
  reason_codes_text TEXT,
  comment_text TEXT,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_feedback_user_message (user_id, message_id),
  CONSTRAINT fk_feedback_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_feedback_conversation FOREIGN KEY (conversation_id) REFERENCES conversations (id),
  CONSTRAINT fk_feedback_message FOREIGN KEY (message_id) REFERENCES conversation_messages (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE web_knowledge_sources (
  id VARCHAR(24) NOT NULL,
  owner_id VARCHAR(24) NOT NULL,
  query_text TEXT,
  title VARCHAR(500) NOT NULL,
  source_url TEXT NOT NULL,
  publisher VARCHAR(300),
  content_text LONGTEXT,
  source_score DECIMAL(7,4),
  status VARCHAR(20) NOT NULL,
  review_note TEXT,
  reviewed_by VARCHAR(24),
  reviewed_at DATETIME,
  provenance_text TEXT,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY ix_web_sources_owner_status (owner_id, status),
  CONSTRAINT fk_web_sources_owner FOREIGN KEY (owner_id) REFERENCES users (id),
  CONSTRAINT fk_web_sources_reviewer FOREIGN KEY (reviewed_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE curriculum_kb_sources (
  id VARCHAR(24) NOT NULL,
  owner_id VARCHAR(24) NOT NULL,
  web_source_id VARCHAR(24),
  title VARCHAR(500) NOT NULL,
  source_url TEXT,
  source_type VARCHAR(40) NOT NULL,
  subject_id VARCHAR(24),
  grade INT,
  curriculum_version VARCHAR(80),
  review_status VARCHAR(20) NOT NULL,
  ingest_status VARCHAR(20) NOT NULL,
  review_note TEXT,
  reviewed_by VARCHAR(24),
  reviewed_at DATETIME,
  provenance_text TEXT,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY ix_curriculum_sources_status (review_status, ingest_status, subject_id),
  CONSTRAINT fk_curriculum_sources_owner FOREIGN KEY (owner_id) REFERENCES users (id),
  CONSTRAINT fk_curriculum_sources_web FOREIGN KEY (web_source_id) REFERENCES web_knowledge_sources (id),
  CONSTRAINT fk_curriculum_sources_subject FOREIGN KEY (subject_id) REFERENCES curriculum_taxonomy (id),
  CONSTRAINT fk_curriculum_sources_reviewer FOREIGN KEY (reviewed_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE knowledge_components (
  id VARCHAR(24) NOT NULL,
  name VARCHAR(240) NOT NULL,
  normalized_name VARCHAR(240) NOT NULL,
  description TEXT,
  subject VARCHAR(160),
  topic VARCHAR(240),
  parent_id VARCHAR(24),
  difficulty DECIMAL(6,5),
  embedding_reference VARCHAR(512),
  aliases_text TEXT,
  provenance_text TEXT,
  status VARCHAR(20) NOT NULL,
  confidence DECIMAL(6,5),
  created_by VARCHAR(24) NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  model_version VARCHAR(80) NOT NULL,
  PRIMARY KEY (id),
  KEY ix_kc_name (normalized_name),
  CONSTRAINT fk_kc_parent FOREIGN KEY (parent_id) REFERENCES knowledge_components (id),
  CONSTRAINT fk_kc_creator FOREIGN KEY (created_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE knowledge_graph_edges (
  id VARCHAR(24) NOT NULL,
  source_knowledge_component_id VARCHAR(24) NOT NULL,
  target_knowledge_component_id VARCHAR(24) NOT NULL,
  relation_type VARCHAR(20) NOT NULL,
  document_id VARCHAR(24) NOT NULL,
  evidence_chunk_ids_text TEXT,
  confidence DECIMAL(6,5),
  status VARCHAR(20) NOT NULL,
  created_by VARCHAR(24) NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  model_version VARCHAR(80) NOT NULL,
  provenance_text TEXT,
  PRIMARY KEY (id),
  UNIQUE KEY uq_kge_pair_type (source_knowledge_component_id, target_knowledge_component_id, relation_type),
  CONSTRAINT fk_kge_source FOREIGN KEY (source_knowledge_component_id) REFERENCES knowledge_components (id),
  CONSTRAINT fk_kge_target FOREIGN KEY (target_knowledge_component_id) REFERENCES knowledge_components (id),
  CONSTRAINT fk_kge_document FOREIGN KEY (document_id) REFERENCES documents (id),
  CONSTRAINT fk_kge_creator FOREIGN KEY (created_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE learning_items (
  id VARCHAR(24) NOT NULL,
  item_type VARCHAR(30) NOT NULL,
  document_id VARCHAR(24),
  primary_knowledge_component_id VARCHAR(24),
  difficulty DECIMAL(6,5),
  discrimination DECIMAL(8,5),
  guessing DECIMAL(6,5),
  bloom_level VARCHAR(20),
  estimated_duration_seconds INT,
  content_cluster_id VARCHAR(80),
  quality_score DECIMAL(6,5),
  verification_status VARCHAR(20) NOT NULL,
  language VARCHAR(16) NOT NULL,
  question_set_id VARCHAR(24),
  question_id VARCHAR(24),
  question_index INT,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  model_version VARCHAR(80) NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_learning_items_document FOREIGN KEY (document_id) REFERENCES documents (id),
  CONSTRAINT fk_learning_items_primary_kc FOREIGN KEY (primary_knowledge_component_id) REFERENCES knowledge_components (id),
  CONSTRAINT fk_learning_items_question_set FOREIGN KEY (question_set_id) REFERENCES question_sets (id),
  CONSTRAINT fk_learning_items_question FOREIGN KEY (question_id) REFERENCES question_bank (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE learning_item_components (
  item_id VARCHAR(24) NOT NULL,
  knowledge_component_id VARCHAR(24) NOT NULL,
  q_matrix_weight DECIMAL(8,6) NOT NULL,
  is_primary BOOLEAN NOT NULL,
  PRIMARY KEY (item_id, knowledge_component_id),
  CONSTRAINT fk_li_components_item FOREIGN KEY (item_id) REFERENCES learning_items (id),
  CONSTRAINT fk_li_components_kc FOREIGN KEY (knowledge_component_id) REFERENCES knowledge_components (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE learning_sessions (
  id VARCHAR(24) NOT NULL,
  user_id VARCHAR(24) NOT NULL,
  session_key VARCHAR(160) NOT NULL,
  document_id VARCHAR(24),
  subject VARCHAR(160),
  started_at DATETIME NOT NULL,
  last_activity_at DATETIME NOT NULL,
  metadata_text TEXT,
  schema_version VARCHAR(80) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_learning_session_user_key (user_id, session_key),
  CONSTRAINT fk_learning_sessions_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_learning_sessions_document FOREIGN KEY (document_id) REFERENCES documents (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE learning_events (
  id VARCHAR(24) NOT NULL,
  user_id VARCHAR(24) NOT NULL,
  session_id VARCHAR(24),
  item_id VARCHAR(24) NOT NULL,
  document_id VARCHAR(24),
  event_type VARCHAR(40) NOT NULL,
  answer LONGTEXT,
  is_correct BOOLEAN,
  score DECIMAL(10,4),
  response_time_ms BIGINT,
  hint_count INT NOT NULL,
  answer_change_count INT NOT NULL,
  attempt_number INT NOT NULL,
  skipped BOOLEAN NOT NULL,
  completed BOOLEAN NOT NULL,
  idempotency_key VARCHAR(160),
  occurred_at DATETIME NOT NULL,
  metadata_text TEXT,
  schema_version VARCHAR(80) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_learning_events_user_key (user_id, idempotency_key),
  KEY ix_learning_events_user_time (user_id, occurred_at),
  CONSTRAINT fk_learning_events_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_learning_events_session FOREIGN KEY (session_id) REFERENCES learning_sessions (id),
  CONSTRAINT fk_learning_events_item FOREIGN KEY (item_id) REFERENCES learning_items (id),
  CONSTRAINT fk_learning_events_document FOREIGN KEY (document_id) REFERENCES documents (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE learner_profiles (
  id VARCHAR(24) NOT NULL,
  user_id VARCHAR(24) NOT NULL,
  grade_level INT,
  strong_subjects_text TEXT,
  weak_subjects_text TEXT,
  target_exam_combinations_text TEXT,
  onboarding_completed BOOLEAN NOT NULL,
  onboarding_completed_at DATETIME,
  education_system VARCHAR(80),
  learning_goals_text TEXT,
  preferred_subjects_text TEXT,
  preferred_content_types_text TEXT,
  preferred_explanation_style VARCHAR(20) NOT NULL,
  preferred_session_minutes INT,
  global_ability DECIMAL(10,6),
  current_level VARCHAR(80),
  ability_cluster_id VARCHAR(80),
  behavior_cluster_id VARCHAR(80),
  interest_cluster_id VARCHAR(80),
  profile_confidence DECIMAL(6,5),
  total_learning_events INT NOT NULL,
  cold_start_status VARCHAR(20) NOT NULL,
  last_active_at DATETIME,
  updated_at DATETIME NOT NULL,
  model_version VARCHAR(80) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_learner_profiles_user (user_id),
  CONSTRAINT fk_learner_profiles_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE learner_knowledge_states (
  id VARCHAR(24) NOT NULL,
  user_id VARCHAR(24) NOT NULL,
  knowledge_component_id VARCHAR(24) NOT NULL,
  mastery_probability DECIMAL(8,7),
  uncertainty DECIMAL(8,7),
  ability_estimate DECIMAL(10,6),
  forgetting_risk DECIMAL(8,7),
  attempt_count INT NOT NULL,
  correct_count INT NOT NULL,
  recent_accuracy DECIMAL(8,7),
  average_response_time_ms DECIMAL(14,3),
  hint_rate DECIMAL(8,7),
  last_practiced_at DATETIME,
  last_updated_at DATETIME NOT NULL,
  bkt_state_text TEXT,
  irt_state_text TEXT,
  model_version VARCHAR(80) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_lks_user_kc (user_id, knowledge_component_id),
  CONSTRAINT fk_lks_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_lks_kc FOREIGN KEY (knowledge_component_id) REFERENCES knowledge_components (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE recommendation_logs (
  id VARCHAR(24) NOT NULL,
  user_id VARCHAR(24) NOT NULL,
  session_id VARCHAR(24),
  item_id VARCHAR(24) NOT NULL,
  candidate_sources_text TEXT,
  feature_snapshot_text LONGTEXT,
  component_scores_text TEXT,
  final_score DECIMAL(12,8) NOT NULL,
  rank_position INT NOT NULL,
  reason_codes_text TEXT,
  shown BOOLEAN NOT NULL,
  clicked BOOLEAN NOT NULL,
  completed BOOLEAN NOT NULL,
  reward DECIMAL(12,8),
  generated_at DATETIME NOT NULL,
  learner_model_version VARCHAR(80) NOT NULL,
  ranking_model_version VARCHAR(80) NOT NULL,
  bandit_policy_version VARCHAR(80) NOT NULL,
  PRIMARY KEY (id),
  KEY ix_recommendation_user_time (user_id, generated_at),
  CONSTRAINT fk_recommendation_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_recommendation_session FOREIGN KEY (session_id) REFERENCES learning_sessions (id),
  CONSTRAINT fk_recommendation_item FOREIGN KEY (item_id) REFERENCES learning_items (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE cluster_models (
  id VARCHAR(24) NOT NULL,
  cluster_type VARCHAR(40) NOT NULL,
  version VARCHAR(80) NOT NULL,
  feature_schema_version VARCHAR(80) NOT NULL,
  feature_names_text TEXT,
  normalization_parameters_text LONGTEXT,
  number_of_clusters INT NOT NULL,
  centroids_text LONGTEXT,
  metrics_text TEXT,
  training_sample_count INT NOT NULL,
  random_state INT,
  interpretation_text TEXT,
  provenance_text TEXT,
  status VARCHAR(20) NOT NULL,
  trained_at DATETIME,
  activated_at DATETIME,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cluster_model_type_version (cluster_type, version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE bandit_policies (
  id VARCHAR(24) NOT NULL,
  policy_type VARCHAR(60) NOT NULL,
  version VARCHAR(80) NOT NULL,
  context_schema_version VARCHAR(80) NOT NULL,
  parameters_text LONGTEXT,
  metrics_text TEXT,
  status VARCHAR(20) NOT NULL,
  trained_at DATETIME,
  activated_at DATETIME,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bandit_policy_type_version (policy_type, version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE ai_usage_events (
  id VARCHAR(24) NOT NULL,
  event_id VARCHAR(80) NOT NULL,
  user_id VARCHAR(24),
  provider VARCHAR(40),
  model_name VARCHAR(120),
  feature VARCHAR(80),
  operation_type VARCHAR(80),
  status VARCHAR(20) NOT NULL,
  input_tokens BIGINT,
  output_tokens BIGINT,
  latency_ms BIGINT,
  estimated_cost DECIMAL(18,8),
  request_id VARCHAR(120),
  document_id VARCHAR(24),
  conversation_id VARCHAR(24),
  error_code VARCHAR(80),
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ai_usage_event_id (event_id),
  KEY ix_ai_usage_user_time (user_id, created_at),
  CONSTRAINT fk_ai_usage_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_ai_usage_document FOREIGN KEY (document_id) REFERENCES documents (id),
  CONSTRAINT fk_ai_usage_conversation FOREIGN KEY (conversation_id) REFERENCES conversations (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE user_activity_logs (
  id VARCHAR(24) NOT NULL,
  user_id VARCHAR(24),
  action VARCHAR(80) NOT NULL,
  category VARCHAR(60) NOT NULL,
  status VARCHAR(20) NOT NULL,
  resource_type VARCHAR(60),
  resource_id VARCHAR(120),
  request_id VARCHAR(120),
  duration_ms BIGINT,
  error_code VARCHAR(80),
  metadata_text TEXT,
  timestamp DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY ix_activity_user_time (user_id, timestamp),
  KEY ix_activity_resource (resource_type, resource_id),
  CONSTRAINT fk_activity_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE admin_audit_logs (
  id VARCHAR(24) NOT NULL,
  admin_user_id VARCHAR(24) NOT NULL,
  action VARCHAR(100) NOT NULL,
  target_type VARCHAR(60) NOT NULL,
  target_id VARCHAR(120),
  reason TEXT,
  result VARCHAR(20) NOT NULL,
  before_snapshot_text LONGTEXT,
  after_snapshot_text LONGTEXT,
  changed_fields_text TEXT,
  request_id VARCHAR(120),
  timestamp DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY ix_admin_audit_actor_time (admin_user_id, timestamp),
  KEY ix_admin_audit_target (target_type, target_id),
  CONSTRAINT fk_admin_audit_actor FOREIGN KEY (admin_user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE website_content (
  id VARCHAR(24) NOT NULL,
  section_key VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL,
  version INT NOT NULL,
  content_text LONGTEXT NOT NULL,
  updated_by VARCHAR(24),
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  published_at DATETIME,
  PRIMARY KEY (id),
  UNIQUE KEY uq_website_content_section (section_key),
  CONSTRAINT fk_website_content_updater FOREIGN KEY (updated_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE website_content_versions (
  id VARCHAR(24) NOT NULL,
  section_key VARCHAR(100) NOT NULL,
  version INT NOT NULL,
  status VARCHAR(20) NOT NULL,
  content_text LONGTEXT NOT NULL,
  created_by VARCHAR(24),
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_website_version (section_key, version),
  CONSTRAINT fk_website_versions_creator FOREIGN KEY (created_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE system_settings (
  id VARCHAR(24) NOT NULL,
  setting_key VARCHAR(100) NOT NULL,
  category VARCHAR(60) NOT NULL,
  value_text LONGTEXT,
  value_type VARCHAR(20) NOT NULL,
  is_public BOOLEAN NOT NULL,
  updated_by VARCHAR(24),
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_system_settings_key (setting_key),
  CONSTRAINT fk_settings_updater FOREIGN KEY (updated_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE feature_flags (
  id VARCHAR(24) NOT NULL,
  flag_key VARCHAR(100) NOT NULL,
  enabled BOOLEAN NOT NULL,
  description TEXT,
  allowed_roles_text TEXT,
  allowed_user_ids_text TEXT,
  updated_by VARCHAR(24),
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_feature_flags_key (flag_key),
  CONSTRAINT fk_flags_updater FOREIGN KEY (updated_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE admin_notifications (
  id VARCHAR(24) NOT NULL,
  notification_type VARCHAR(30) NOT NULL,
  title VARCHAR(200) NOT NULL,
  content_text LONGTEXT NOT NULL,
  status VARCHAR(20) NOT NULL,
  audience_type VARCHAR(20) NOT NULL,
  target_roles_text TEXT,
  target_user_ids_text TEXT,
  starts_at DATETIME,
  expires_at DATETIME,
  created_by VARCHAR(24) NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  published_at DATETIME,
  cancelled_at DATETIME,
  PRIMARY KEY (id),
  KEY ix_notifications_status_time (status, starts_at),
  CONSTRAINT fk_notifications_creator FOREIGN KEY (created_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE notification_reads (
  id VARCHAR(24) NOT NULL,
  notification_id VARCHAR(24) NOT NULL,
  user_id VARCHAR(24) NOT NULL,
  read_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_notification_user_read (notification_id, user_id),
  CONSTRAINT fk_notification_reads_notification FOREIGN KEY (notification_id) REFERENCES admin_notifications (id),
  CONSTRAINT fk_notification_reads_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE background_jobs (
  id VARCHAR(24) NOT NULL,
  job_type VARCHAR(80) NOT NULL,
  payload_text LONGTEXT NOT NULL,
  status VARCHAR(20) NOT NULL,
  attempts INT NOT NULL,
  max_attempts INT NOT NULL,
  next_run_at DATETIME NOT NULL,
  locked_by VARCHAR(100),
  locked_until DATETIME,
  result_text LONGTEXT,
  error_text LONGTEXT,
  idempotency_key VARCHAR(200),
  correlation_id VARCHAR(120),
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_background_jobs_idempotency (idempotency_key),
  KEY ix_background_jobs_ready (status, job_type, next_run_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
