const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql2');
const dotenv = require('dotenv');
const bcrypt = require('bcrypt'); // Importar a biblioteca bcrypt
const cors = require('cors'); // Importar o middleware CORS
dotenv.config({ path: 'envconfig' }); // Carrega as variáveis de ambiente do arquivo 'envconfig'

const { format } = require('date-fns');
const app = express();
const port = process.env.PORT || 3000;
const jwt = require('jsonwebtoken');

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ esxtended: true }));
app.use(cors());

dotenv.config();
// Configure as variáveis de ambiente com as informações de conexão ao banco de dados
const DATABASE_URL='mysql://fq76ocaxe4hfhrl7w88c:pscale_pw_f4LVaXDcqsTcWrPOEe4MyHWix1Zs3xSLKNOI10MY8nP@aws.connect.psdb.cloud/chat-bot?ssl={"rejectUnauthorized":true}'
// Configuração da conexão com o banco de dados
const connection = mysql.createConnection(DATABASE_URL);

// Teste de conexão com o banco de dados
connection.connect(err => {
  if (err) {
    console.error('Erro ao conectar ao banco de dados:', err);
    return;
  }
  console.log('Conexão com o banco de dados MySQL estabelecida');
});


// Middleware para verificar o token de autenticação
const verifyToken = (req, res, next) => {
  const { authorization } = req.headers;

  if (!authorization || !authorization.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Token não fornecido ou em formato inválido' });
  }

  const token = authorization.split(' ')[1];
  
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({ message: 'Token inválido' });
    }
    req.user = decoded; // Decodificado e disponível no objeto de solicitação
    console.log(req.user)
    next();
  });
};

app.get('/', (req, res) => {
  return res.json("Hello Word");
});

// Rota para verificar se a senha corresponde ao email do usuário
app.post('/verificar-senha', (req, res) => {
  const { email, senha } = req.body;

  // Consultar o banco de dados para obter a senha e o ID do usuário com base no email
  connection.query('SELECT id_user, senha FROM usuarios WHERE email = ?', email, (err, results) => {
    if (err) {
      console.error('Erro ao verificar senha:', err);
      res.status(500).json({ error: 'Erro ao verificar senha' });
      return;
    }

    if (results.length === 0) {
      // Usuário não encontrado com o email fornecido
      res.status(404).json({ error: 'Usuário não encontrado' });
      return;
    }

    const id_user = results[0].id_user;
    const senhaArmazenada = results[0].senha;

    // Comparar a senha fornecida com a senha armazenada no banco de dados
    bcrypt.compare(senha, senhaArmazenada, (err, match) => {
      if (err) {
        console.error('Erro ao comparar senhas:', err);
        res.status(500).json({ error: 'Erro ao comparar senhas' });
        return;
      }

      if (match) {
        const payload = {  id_user: id_user};
        console.log(payload)
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '100d' });
        res.json({ token });
      } else {
        res.status(401).json({ error: 'Senha inválida' });
      }
    });
  });
});


// Rota POST para cadastrar usuário com criptografia da senha
app.post('/usuarios', (req, res) => {
  const novoUsuario = req.body;
  // Verificar se o e-mail já existe na tabela 'usuarios'
  connection.query('SELECT * FROM usuarios WHERE email = ?', novoUsuario.email, (err, results) => {
    if (err) {
      console.error('Erro ao verificar e-mail duplicado:', err);
      res.status(500).json({ error: 'Erro ao verificar e-mail duplicado' });
      return;
    }

    if (results.length > 0) {
      // O e-mail já está cadastrado, retornar um erro
      res.status(400).json({ error: 'E-mail já cadastrado' });
      return;
    }

    // Criptografar a senha antes de inserir no banco de dados
    bcrypt.hash(novoUsuario.senha, 10, (err, hash) => {
      if (err) {
        console.error('Erro ao criar hash da senha:', err);
        res.status(500).json({ error: 'Erro ao criar hash da senha' });
        return;
      }

      // Substituir a senha pelo hash criptografado
      novoUsuario.senha = hash;

      // Inserir o novo usuário no banco de dados, pois o e-mail é único
      connection.query('INSERT INTO usuarios SET ?', novoUsuario, (err, result) => {
        if (err) {
          console.error('Erro ao criar usuário:', err);
          res.status(500).json({ error: 'Erro ao criar usuário' });
          return;
        }
        novoUsuario.id = result.insertId;
        res.status(201).json({ message: 'Usuário cadastrado com sucesso!' });
      });
    });
  });
});


app.use(verifyToken);


// Rota POST para cadastrar reserva
app.post('/reservas', (req, res) => {
  // Get the user ID (usuario_id) from the decoded JWT token
  const usuarioId = req.user.id_user;

  // Combine the user's ID with the reservation data from the request body
  const novaReserva = {
    ...req.body,
    usuario_id: usuarioId,
  };

  // Insert the new reservation into the database
  connection.query('INSERT INTO reservas SET ?', novaReserva, (err, result) => {
    if (err) {
      console.error('Erro ao criar reserva:', err);
      res.status(500).json({ error: 'Erro ao criar reserva' });
      return;
    }

    // Reservation created successfully, return a simple message
    res.status(201).json({ message: 'Reserva cadastrada com sucesso!' });
  });
});


// Rota para retornar as reservas do usuário excluindo usuario_id
app.get('/reservas-usuario', (req, res) => {
  // Get the user ID (usuario_id) from the decoded JWT token
  const usuarioId = req.user.id_user;

  // Execute the SQL query to retrieve reservations, excluding usuario_id
  connection.query(
    'SELECT r.id_reserva, r.data_reserva, r.horario_inicio, r.horario_fim, r.sala_id, s.capacidade, s.localizacao, s.descricao, s.tipo_sala ' +
    'FROM reservas r ' +
    'INNER JOIN salas s ON r.sala_id = s.id_sala ' +
    'WHERE r.usuario_id = ?',
    [usuarioId],
    (err, results) => {
      if (err) {
        console.error('Erro ao buscar reservas do usuário:', err);
        res.status(500).json({ error: 'Erro ao buscar reservas do usuário' });
        return;
      }

      // Format the date in Brazilian standard format for each reservation
      const formattedResults = results.map(result => ({
        ...result,
        data_reserva: format(new Date(result.data_reserva), 'dd/MM/yyyy'),
      }));

      res.json(formattedResults);
    }
  );
});



//http://seusite.com/salas-disponiveis?dia=2023-09-25&horarioInicio=08:00&horarioFim=12:00&capacidade=20
// Rota para buscar salas disponíveis
app.get('/salas-disponiveis', (req, res) => {
  const { dia, horarioInicio, horarioFim, capacidade } = req.query;
  // Execute a consulta SQL no banco de dados com os parâmetros recebidos
  connection.query(
    'SELECT * FROM salas WHERE capacidade >= ? AND id_sala NOT IN (SELECT sala_id FROM reservas WHERE data_reserva = ? AND ((horario_inicio BETWEEN ? AND ?) OR (horario_fim BETWEEN ? AND ?)))',
    [capacidade, dia, horarioInicio, horarioFim, horarioInicio, horarioFim],
    (err, results) => {
      if (err) {
        console.error('Erro ao buscar salas disponíveis:', err);
        res.status(500).json({ error: 'Erro ao buscar salas disponíveis' });
        return;
      }
      res.json(results);
    }
  );
});

// Rota para retornar todas as salas
app.get('/salas', (req, res) => {
  connection.query('SELECT * FROM salas', (err, results) => {
    if (err) {
      console.error('Erro ao buscar todas as salas:', err);
      res.status(500).json({ error: 'Erro ao buscar todas as salas' });
      return;
    }
    res.json(results);
  });
});


// Rota para excluir uma reserva específica por ID (apenas pelo usuário dono da reserva)
app.delete('/reservas/:id', (req, res) => {
  const reservationId = req.params.id;
  const userId = req.user.id_user; // Get the user ID from the JWT token

  // Execute a single SQL query to delete the reservation and check ownership
  connection.query(
    'DELETE FROM reservas WHERE id_reserva = ? AND usuario_id = ?',
    [reservationId, userId],
    (err, result) => {
      if (err) {
        console.error('Erro ao excluir a reserva:', err);
        res.status(500).json({ error: 'Erro ao excluir a reserva' });
        return;
      }

      if (result.affectedRows === 0) {
        res.status(403).json({ message: 'Você não tem permissão para excluir esta reserva ou a reserva não existe' });
      } else {
        res.status(200).json({ message: 'Reserva excluída com sucesso' });
      }
    }
  );
});


// Iniciar o servidor
app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});
//connection.end()
