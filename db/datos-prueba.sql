-- Datos sintéticos para desarrollo y pruebas, sin datos reales del diario.
-- Cubren los casos que importan: noticia con varias versiones, noticia
-- confidencial, versión eliminada recuperable, cables leídos y reservados.
--
--   psql -d jsdr_copia -f db/datos-prueba.sql

INSERT INTO secciones (id, nombre, codigo) VALUES
  (1,'POLITICA','PL'), (5,'DEPORTES','DE'), (28,'CIUDAD','IG'), (9,'MUNDO','EX');
INSERT INTO agencias (id, nombre, codigo, habilitada, dias_vida_util) VALUES
  (1,'TELAM','S',true,3), (5,'AP','v',true,3), (2,'REUTERS','f',false,3);
INSERT INTO permisos (id, nombre, descripcion, general) VALUES
  (1,'REDACTAR_NOTICIA','Redactar noticia',false),
  (2,'FOTOCOMPONER_NOTICIA','Fotocomponer noticia',false),
  (9,'ASIGNAR_PERMISOS','Asignar permisos',true);

-- niveles reales: 10 redactor, 20 jefe, 30 secretario
INSERT INTO usuarios (id, username, nivel, password, nombre_apellido, dni, habilitado) VALUES
  (1,'mgomez',10,'1234','Marcela Gomez','20111222',true),
  (2,'jperez',20,'1234','Juan Perez','20333444',true),
  (3,'lsosa',30,'1234','Laura Sosa','20555666',true),
  (4,'baja',10,'1234','Usuario Baja','20777888',false);
INSERT INTO usuarios_secciones (id_usuario,id_seccion,seccion_default) VALUES
  (1,1,true),(1,5,false),(2,1,true),(3,28,true);
INSERT INTO usuarios_permisos (id_usuario,id_permiso) VALUES (3,9);
INSERT INTO usuarios_permisos_secciones (id_usuario,id_permiso,id_seccion) VALUES (1,1,1),(2,1,1);

INSERT INTO noticias (id, guia, numero_version_activa, numero_proxima_version) VALUES
  (100,'paro-8901',3,4), (101,'reserva-8902',1,2), (102,'borrada-8903',1,2), (103,'mundial-8904',1,2);

INSERT INTO versiones (id_noticia,numero,fecha_publicacion,id_seccion,volanta,titulo,bajada,cuerpo,titular,
   estado,eliminada,nivel,redactor,id_redactor,nivel_redactor,confidencial,
   medida_cm,medida_lineas,medida_titulo_cm,medida_titulo_lineas) VALUES
  (100,1,'2026-09-15',1,'Gremios','Paro general el jueves','Los sindicatos confirmaron','Cuerpo v1','Titular v1','EN_EJECUCION',false,10,'mgomez',1,10,false,12.5,42,3.2,1),
  (100,2,'2026-09-16',1,'Gremios','Paro general confirmado','Con acatamiento alto','Cuerpo v2','Titular v2','AUTORIZADA',false,20,'jperez',2,20,false,14.1,48,3.4,1),
  (100,3,'2026-09-17',1,'Gremios','Paro: el Gobierno responde','Tension en Economia','Cuerpo v3','Titular v3','FOTOCOMPUESTA',false,30,'lsosa',3,30,false,15.0,51,3.5,1),
  (101,1,'2026-09-17',1,'Reservado','Nota confidencial','No publicar','Cuerpo conf','Tit conf','EN_EDICION',false,10,'mgomez',1,10,true,8.0,27,2.1,1),
  (102,1,'2026-09-10',5,'Futbol','Nota eliminada','Se dio de baja','Cuerpo elim','Tit elim','EN_EJECUCION',true,10,'mgomez',1,10,false,5.0,17,1.8,1),
  (103,1,'2026-09-18',9,'Suramericanos','Rosario recibe los Juegos','Cuatro mil atletas','Cuerpo mundial','Tit mundial','AUTORIZADA',false,20,'jperez',2,20,false,22.3,76,4.0,2);
UPDATE versiones SET fecha_eliminacion='2026-09-11' WHERE id_noticia=102;

INSERT INTO cables (id,numero,prioridad,fecha_recepcion,hora_recepcion,tema,titulo,cuerpo,id_agencia,medida_cm,medida_lineas) VALUES
  (500,1201,'U','2026-09-18','07:15:00','POL','Telam urgente sobre paritarias','Cuerpo cable 1',1,6.2,21),
  (501,1202,'N','2026-09-18','08:40:00','DEP','AP informa sobre los Juegos','Cuerpo cable 2',5,9.8,33),
  (502,1203,'N','2026-09-17','19:05:00','INT','Telam internacional','Cuerpo cable 3',1,4.4,15);
INSERT INTO cables_leidos (id_usuario,id_cable) VALUES (1,500);
INSERT INTO reservas_cables (id_cable,username,fecha) VALUES (501,'mgomez','2026-09-18');

INSERT INTO usos (numero,descripcion,texto) VALUES (7301,'Cuerpo texto 9/10.4','<e573><p9l10.4f76m11.6>');
INSERT INTO comandos (nombre,valor,id_seccion,id_usuario) VALUES ('bold','<f76>',1,NULL);
INSERT INTO diccionario (palabra) VALUES ('Rosario'),('paritarias');

SELECT setval('noticias_id_seq', 200); SELECT setval('usuarios_id_seq', 10);
SELECT setval('cables_id_seq', 600);
