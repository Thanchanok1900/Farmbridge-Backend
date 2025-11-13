--
-- PostgreSQL database dump
--

-- Dumped from database version 17.5
-- Dumped by pg_dump version 17.5

-- Started on 2025-11-12 23:11:20

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 5916 (class 0 OID 37223)
-- Dependencies: 224
-- Data for Name: buyers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.buyers (id, fullname, email, password_hash, phone, address, location_geom, is_active, created_at, updated_at) FROM stdin;
1	สมชาย ใจเกเร	somchai@gmail.com	$2b$10$YVzq3pHefKv96hyY1Q5IxuqoXNHu//0CYczdETjmyDdybr96Ihk4e	0812345604	12 หมู่ 5 ตำบลเมือง อำเภอเมือง จังหวัดเชียงใหม่	0101000020E61000005A6D5919E8C258403739D78BFCCB3240	t	2025-11-12 15:44:04.098+07	2025-11-12 15:44:04.098+07
\.


--
-- TOC entry 5918 (class 0 OID 37235)
-- Dependencies: 226
-- Data for Name: dashboard_metrics; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.dashboard_metrics (id, total_sales_value, total_transactions, average_price, waste_reduced_kg, updated_at) FROM stdin;
\.


--
-- TOC entry 5920 (class 0 OID 37250)
-- Dependencies: 228
-- Data for Name: demands; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.demands (id, buyer_id, product_name, desired_quantity, unit, desired_price, status, location_geom, created_at, updated_at) FROM stdin;
\.


--
-- TOC entry 5922 (class 0 OID 37260)
-- Dependencies: 230
-- Data for Name: farmers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.farmers (id, fullname, email, password_hash, phone, address, location_geom, farmer_doc_url, is_active, created_at, updated_at) FROM stdin;
1	สมชาย ใจดี	somchai@gmail.com	$2b$10$4ETvCZ7v2Vl/uQQ4qIVRw..hCdwAHeXdHOBY.QFNrNS17KgfR0K3m	0812345678	123 หมู่ 5 ตำบลเมือง อำเภอเมือง จังหวัดเชียงใหม่	\N	https://example.com/docs/farmer_doc.pdf	t	2025-11-12 14:28:11.079+07	2025-11-12 14:28:11.079+07
2	สมหมาย ใจร้าย	sommai@gmail.com	$2b$10$L4AD6IZJ7y2pL2bTx2syqu641wZKEg79em1hGtIet6G8nc1hwEvKa	0812345678	185 หมู่ 4 ตำบลเมือง อำเภอเมือง จังหวัดเชียงใหม่	0101000020E61000006237C71487C35840A18A76700BC53240	https://example.com/docs/farmer_doc.pdf	t	2025-11-12 15:38:48.223+07	2025-11-12 15:38:48.224+07
\.


--
-- TOC entry 5924 (class 0 OID 37278)
-- Dependencies: 232
-- Data for Name: listings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.listings (id, seller_id, product_name, grade, quantity_total, quantity_available, unit, price_per_unit, market_price_low, market_price_high, description, image_url, pickup_date, pickup_time, status, location_geom, created_at, updated_at) FROM stdin;
\.


--
-- TOC entry 5926 (class 0 OID 37302)
-- Dependencies: 234
-- Data for Name: matches; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.matches (id, listing_id, demand_id, distance_km, matched_price, status, created_at) FROM stdin;
\.


--
-- TOC entry 5928 (class 0 OID 37320)
-- Dependencies: 236
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.notifications (id, user_id, message, type, is_read, created_at) FROM stdin;
\.


--
-- TOC entry 5930 (class 0 OID 37330)
-- Dependencies: 238
-- Data for Name: price_history; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.price_history (id, product_name, average_price, min_price, max_price, source, record_date) FROM stdin;
\.


--
-- TOC entry 5708 (class 0 OID 36458)
-- Dependencies: 219
-- Data for Name: spatial_ref_sys; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.spatial_ref_sys (srid, auth_name, auth_srid, srtext, proj4text) FROM stdin;
\.


--
-- TOC entry 5932 (class 0 OID 37346)
-- Dependencies: 240
-- Data for Name: transactions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.transactions (id, match_id, buyer_id, seller_id, product_name, quantity, price_per_unit, total_amount, payment_status, payment_slip_url, pickup_date, pickup_code, created_at, updated_at) FROM stdin;
\.


--
-- TOC entry 5948 (class 0 OID 0)
-- Dependencies: 223
-- Name: buyers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.buyers_id_seq', 1, true);


--
-- TOC entry 5949 (class 0 OID 0)
-- Dependencies: 225
-- Name: dashboard_metrics_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.dashboard_metrics_id_seq', 1, false);


--
-- TOC entry 5950 (class 0 OID 0)
-- Dependencies: 227
-- Name: demands_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.demands_id_seq', 1, false);


--
-- TOC entry 5951 (class 0 OID 0)
-- Dependencies: 229
-- Name: farmers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.farmers_id_seq', 2, true);


--
-- TOC entry 5952 (class 0 OID 0)
-- Dependencies: 231
-- Name: listings_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.listings_id_seq', 1, false);


--
-- TOC entry 5953 (class 0 OID 0)
-- Dependencies: 233
-- Name: matches_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.matches_id_seq', 1, false);


--
-- TOC entry 5954 (class 0 OID 0)
-- Dependencies: 235
-- Name: notifications_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.notifications_id_seq', 1, false);


--
-- TOC entry 5955 (class 0 OID 0)
-- Dependencies: 237
-- Name: price_history_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.price_history_id_seq', 1, false);


--
-- TOC entry 5956 (class 0 OID 0)
-- Dependencies: 239
-- Name: transactions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.transactions_id_seq', 1, false);


-- Completed on 2025-11-12 23:11:21

--
-- PostgreSQL database dump complete
--

